#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, "..");
const distDir = resolve(packageDir, "dist");
const pluginDir = resolve(distDir, "plugin");
const bundleDir = resolve(distDir, "figma-community-submission");
const archivePath = resolve(distDir, "spfr-figma-plugin-community.zip");
const { version } = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8"));

if (!existsSync(resolve(pluginDir, "manifest.json"))) {
  throw new Error("Build the plugin first with npm run build:plugin.");
}

rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(resolve(bundleDir, "plugin"), { recursive: true });

cpSync(pluginDir, resolve(bundleDir, "plugin"), { recursive: true });
cpSync(resolve(packageDir, "community", "listing.md"), resolve(bundleDir, "listing.md"));
cpSync(resolve(packageDir, "community", "privacy.md"), resolve(bundleDir, "privacy.md"));
cpSync(resolve(packageDir, "community", "submission-checklist.md"), resolve(bundleDir, "submission-checklist.md"));

writeFileSync(
  resolve(bundleDir, "VERSION.txt"),
  `SPFR Figma Design Pipeline\nVersion: ${version}\n`
);

rmSync(archivePath, { force: true });
execFileSync("zip", ["-qr", archivePath, "."], {
  cwd: bundleDir,
  stdio: "inherit",
});

console.log(`Figma Community submission bundle complete: ${archivePath}`);
