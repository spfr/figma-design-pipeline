#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, "..");
const distDir = resolve(packageDir, "dist");
const bundleDir = resolve(distDir, "desktop-extension");
const serverEntry = resolve(distDir, "index.js");
const pluginDir = resolve(distDir, "plugin");
const bundlePath = resolve(distDir, "figma-design-pipeline.mcpb");
const { version } = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8"));

if (!existsSync(serverEntry) || !existsSync(resolve(pluginDir, "manifest.json"))) {
  throw new Error("Build the server and plugin before packaging the desktop extension.");
}

rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(resolve(bundleDir, "server"), { recursive: true });
mkdirSync(resolve(bundleDir, "assets", "figma-plugin"), { recursive: true });

cpSync(serverEntry, resolve(bundleDir, "server", "index.js"));
cpSync(pluginDir, resolve(bundleDir, "assets", "figma-plugin"), { recursive: true });

const manifest = {
  manifest_version: "0.1",
  dxt_version: "0.1",
  name: "figma-design-pipeline",
  display_name: "SPFR Figma Design Pipeline",
  version,
  description: "Two-way Figma automation via MCP for inspect, mutation, token sync, and code generation workflows.",
  author: {
    name: "SPFR",
  },
  server: {
    type: "node",
    entry_point: "server/index.js",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/server/index.js"],
      env: {
        FIGMA_ACCESS_TOKEN: "${user_config.figma_access_token}",
        FIGMA_FILE_KEY: "${user_config.figma_file_key}",
        COMPONENT_REGISTRY_DIR: "${user_config.component_registry_dir}",
      },
    },
  },
  user_config: {
    figma_access_token: {
      type: "string",
      title: "Figma access token",
      description: "Personal access token used for Figma REST API reads.",
      sensitive: true,
      required: true,
    },
    figma_file_key: {
      type: "string",
      title: "Default Figma file key",
      description: "Optional default file key. You can still pass figmaUrl directly in tool calls.",
      required: false,
      default: "",
    },
    component_registry_dir: {
      type: "string",
      title: "Component registry directory",
      description: "Optional path to registry/<name>-components.json files for codegen.",
      required: false,
      default: "",
    },
  },
};

writeFileSync(resolve(bundleDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  resolve(bundleDir, "assets", "README.txt"),
  "Figma plugin files are included under assets/figma-plugin/. Import assets/figma-plugin/manifest.json in Figma desktop.\n"
);

rmSync(bundlePath, { force: true });
execFileSync("zip", ["-qr", bundlePath, "."], {
  cwd: bundleDir,
  stdio: "inherit",
});

console.log(`Claude Desktop bundle complete: ${bundlePath}`);
