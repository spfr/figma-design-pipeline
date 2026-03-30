#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname, "..");
const repoRoot = resolve(packageDir, "..");
const bundledSkillDir = resolve(packageDir, "skill");
const repoSkillDir = resolve(repoRoot, "skills", "figma-design-pipeline");
const skillDir = existsSync(bundledSkillDir) ? bundledSkillDir : repoSkillDir;
const distDir = resolve(packageDir, "dist");
const serverBundlePath = resolve(distDir, "index.js");
const codexConfigPath = resolve(os.homedir(), ".codex", "config.toml");
const codexSkillDir = resolve(os.homedir(), ".codex", "skills", "figma-design-pipeline");
const agentsSkillDir = resolve(os.homedir(), ".agents", "skills", "figma-design-pipeline");
const geminiSkillDir = resolve(os.homedir(), ".gemini", "skills", "figma-design-pipeline");
const claudeSkillDir = resolve(os.homedir(), ".claude", "skills", "figma-design-pipeline");

const args = process.argv.slice(2);
const options = {
  client: "all",
  skipBuild: false,
  skipSkill: false,
  skipMcp: false,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--client" && args[i + 1]) {
    options.client = args[++i];
  } else if (arg === "--skip-build") {
    options.skipBuild = true;
  } else if (arg === "--skip-skill") {
    options.skipSkill = true;
  } else if (arg === "--skip-mcp") {
    options.skipMcp = true;
  } else if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    printHelp();
    process.exit(1);
  }
}

const knownClients = new Set(["all", "claude", "claude-code", "gemini", "gemini-cli", "codex", "codex-cli"]);
if (!knownClients.has(options.client)) {
  console.error(`Unsupported client: ${options.client}`);
  printHelp();
  process.exit(1);
}

ensureBuildArtifacts();

const installed = [];

if (matches(options.client, "claude", "claude-code")) {
  if (!options.skipSkill) {
    linkSkill(skillDir, claudeSkillDir);
    installed.push(`Claude skill -> ${claudeSkillDir}`);
  }
  if (!options.skipMcp) {
    installClaudeCodeMcp();
    installed.push("Claude Code MCP server -> figma-design-pipeline");
  }
}

if (matches(options.client, "gemini", "gemini-cli")) {
  if (!options.skipSkill) {
    linkSkill(skillDir, agentsSkillDir);
    linkSkill(skillDir, geminiSkillDir);
    installed.push(`Gemini skill -> ${geminiSkillDir}`);
  }
  if (!options.skipMcp) {
    installGeminiMcp();
    installed.push("Gemini MCP server -> figma-design-pipeline");
  }
}

if (matches(options.client, "codex", "codex-cli")) {
  if (!options.skipSkill) {
    linkSkill(skillDir, codexSkillDir);
    installed.push(`Codex skill -> ${codexSkillDir}`);
  }
  if (!options.skipMcp) {
    installCodexMcp();
    installed.push(`Codex MCP server -> ${codexConfigPath}`);
  }
}

console.log("");
console.log("Installed:");
for (const line of installed) {
  console.log(`- ${line}`);
}
console.log("");
console.log("Next steps:");
console.log("- All major CLIs (Claude Code, Codex, Gemini) support the official Figma MCP via OAuth.");
console.log("- FIGMA_ACCESS_TOKEN is only needed for this server's REST API analysis tools.");
console.log("- Use the official Figma MCP for full read/write Figma access — no token needed.");

function printHelp() {
  console.log(`Usage: spfr-figma-design-pipeline-install [options]

Options:
  --client <name>   all | claude | claude-code | gemini | gemini-cli | codex | codex-cli
  --skip-build      Reuse existing dist/ artifacts
  --skip-skill      Skip skill symlink installation
  --skip-mcp        Skip MCP client configuration
  --help            Show this help

All major CLIs (Claude Code, Codex, Gemini) support the official Figma MCP
via OAuth — no personal access token needed for Figma reads and writes.

FIGMA_ACCESS_TOKEN is only needed for this server's REST API analysis tools.
`);
}

function matches(selected, ...names) {
  return selected === "all" || names.includes(selected);
}

function runBuildStep(scriptPath) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: packageDir,
    stdio: "inherit",
  });
}

function ensureBuildArtifacts() {
  const needsServer = !options.skipMcp && matches(options.client, "claude", "claude-code", "gemini", "gemini-cli", "codex", "codex-cli");

  if (needsServer) {
    ensureArtifact({
      path: serverBundlePath,
      script: resolve(packageDir, "scripts", "build-server.mjs"),
      label: "MCP server bundle",
    });
  }
}

function ensureArtifact({ path, script, label }) {
  if (existsSync(path)) {
    return;
  }

  if (options.skipBuild) {
    throw new Error(`Missing ${label} at ${path}. Re-run without --skip-build or build the package first.`);
  }

  if (!script || !existsSync(script)) {
    throw new Error(`Missing ${label} at ${path}. This install target expects bundled dist/ artifacts, but the package does not include them.`);
  }

  runBuildStep(script);

  if (!existsSync(path)) {
    throw new Error(`Failed to create ${label} at ${path}.`);
  }
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function linkSkill(source, target) {
  ensureDir(dirname(target));

  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) {
      rmSync(target, { force: true });
    } else {
      throw new Error(`Refusing to replace non-symlink directory at ${target}`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
  }

  symlinkSync(source, target, "dir");
}

function installClaudeCodeMcp() {
  const serverJson = JSON.stringify(buildStdioServerConfig(), null, 2);
  if (hasCommand("claude")) {
    try {
      execFileSync("claude", ["mcp", "add-json", "--scope", "user", "figma-design-pipeline", serverJson], {
        stdio: ["ignore", "inherit", "inherit"],
        timeout: 15000,
      });
      return;
    } catch {
      console.log("Claude MCP CLI registration failed. Falling back to a config snippet.");
    }
  }

  const fallbackDir = resolve(os.homedir(), ".figma-design-pipeline");
  ensureDir(fallbackDir);
  writeFileSync(resolve(fallbackDir, "claude.mcp.json"), `${serverJson}\n`);
  console.log("Claude CLI not found. Wrote fallback config snippet to ~/.figma-design-pipeline/claude.mcp.json");
}

function installGeminiMcp() {
  const config = buildStdioServerConfig();
  const settingsPath = resolve(os.homedir(), ".gemini", "settings.json");
  ensureDir(dirname(settingsPath));
  const current = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  current.mcpServers ??= {};
  current.mcpServers["figma-design-pipeline"] = {
    command: "node",
    args: config.args,
    env: {
      FIGMA_ACCESS_TOKEN: "$FIGMA_ACCESS_TOKEN",
      FIGMA_FILE_KEY: "$FIGMA_FILE_KEY",
      COMPONENT_REGISTRY_DIR: "$COMPONENT_REGISTRY_DIR",
    },
  };
  writeFileSync(settingsPath, `${JSON.stringify(current, null, 2)}\n`);
}

function installCodexMcp() {
  const block = [
    "# BEGIN figma-design-pipeline",
    '[mcp_servers."figma-design-pipeline"]',
    'command = "node"',
    `args = [${JSON.stringify(resolve(distDir, "index.js"))}]`,
    'env = { FIGMA_ACCESS_TOKEN = "$FIGMA_ACCESS_TOKEN", FIGMA_FILE_KEY = "$FIGMA_FILE_KEY", COMPONENT_REGISTRY_DIR = "$COMPONENT_REGISTRY_DIR" }',
    "startup_timeout_ms = 30000",
    "# END figma-design-pipeline",
    "",
  ].join("\n");

  ensureDir(dirname(codexConfigPath));
  const current = existsSync(codexConfigPath) ? readFileSync(codexConfigPath, "utf8") : "";
  const next = replaceManagedBlock(current, "figma-design-pipeline", block);
  writeFileSync(codexConfigPath, next);
}

function replaceManagedBlock(input, name, block) {
  const start = `# BEGIN ${name}`;
  const end = `# END ${name}`;
  const pattern = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}\\n?`, "g");
  const stripped = input.replace(pattern, "").trimEnd();
  return `${stripped ? `${stripped}\n\n` : ""}${block}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildStdioServerConfig() {
  return {
    command: "node",
    args: [serverBundlePath],
    env: {
      FIGMA_ACCESS_TOKEN: "$FIGMA_ACCESS_TOKEN",
      FIGMA_FILE_KEY: "$FIGMA_FILE_KEY",
      COMPONENT_REGISTRY_DIR: "$COMPONENT_REGISTRY_DIR",
    },
  };
}

function hasCommand(command) {
  const result = spawnSync("which", [command], { stdio: "ignore" });
  return result.status === 0;
}
