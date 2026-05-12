# Installation

This guide covers installing `@spicefactory/figma-design-pipeline` for Claude Code, Codex CLI, and Gemini CLI.

## Prerequisites

- **Node.js 24.x or newer** (active LTS). Check with `node --version`. Install from [nodejs.org](https://nodejs.org/) or via [`nvm`](https://github.com/nvm-sh/nvm).
- **Figma Desktop** (only needed for the 30-60x faster plugin bridge — see [Step 2](#2-import-the-figma-plugin-recommended)).
- One of: Claude Code, Codex CLI, or Gemini CLI.

A `FIGMA_ACCESS_TOKEN` is **optional**. All three CLIs support the official Figma MCP via OAuth, which handles Figma reads and writes without any token. The token is only required if you want this server's REST-API analysis tools (structured tree inspection, token extraction, audit).

## 1. Install the MCP server

### One-line install (recommended)

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

This:
- Copies the server bundle to `~/.figma-design-pipeline/server/index.js`
- Copies the skill to `~/.figma-design-pipeline/skill/`
- Copies the Figma plugin to `~/.figma-design-pipeline/plugin/`
- Registers the MCP server with every detected CLI
- Symlinks the skill into each CLI's skills directory

To install for a single CLI only, replace `--client all` with `--client claude`, `--client codex`, or `--client gemini`.

### From source

```bash
git clone https://github.com/spfr/figma-design-pipeline.git
cd figma-design-pipeline
npm install
npm run install:clients
```

### Updating

Re-run the same install command. It refreshes the server, skill, and plugin in place — no need to uninstall first.

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

### Installer flags

```
spfr-figma-design-pipeline-install [options]

  --client <name>   all | claude | claude-code | gemini | gemini-cli | codex | codex-cli
  --skip-build      Reuse existing dist/ artifacts (source installs only)
  --skip-skill      Skip skill symlink installation
  --skip-mcp        Skip MCP client configuration
  --help            Show this help
```

## 2. Import the Figma plugin (recommended)

The plugin gives you **30-60x faster writes**. With it, `figma_execute` sends batched actions over WebSocket to a long-lived plugin process — 50 operations finish in ~200ms vs ~50 seconds with one-shot `use_figma` calls.

Without it, `figma_execute` still works — it returns ready-made fallback JavaScript that you (or the agent) can run via `use_figma`.

To import:

1. Open **Figma Desktop**
2. **Plugins → Development → Import plugin from manifest**
3. Pick `~/.figma-design-pipeline/plugin/manifest.json`
4. Run the plugin once. It opens a small panel that shows **Connected**.

The plugin auto-connects to a local WebSocket bridge on ports 4010–4014. The first available port wins.

## 3. Verify the install

Open your CLI and run:

```
figma_plugin_status
```

Expected:
```json
{ "connected": true, "port": 4010 }
```

(Port may be 4011/4012/4013/4014 if 4010 is already in use.)

### Claude Code

```bash
claude mcp get figma-design-pipeline
ls ~/.claude/skills/figma-design-pipeline
ls ~/.figma-design-pipeline/plugin/manifest.json
```

The MCP entry should point at `~/.figma-design-pipeline/server/index.js`, not `~/.npm/_npx/...`.

### Codex CLI

```bash
grep -A4 "figma-design-pipeline" ~/.codex/config.toml
ls ~/.codex/skills/figma-design-pipeline
```

### Gemini CLI

```bash
grep -A4 "figma-design-pipeline" ~/.gemini/settings.json
ls ~/.gemini/skills/figma-design-pipeline
```

## 4. (Optional) REST API analysis tools

If you want this server's REST-based inspection tools (`figma_get_tree`, `figma_audit`, `figma_extract_tokens`, etc.), set a personal access token:

```bash
export FIGMA_ACCESS_TOKEN=figd_your_token_here
```

Get one from [Figma → Settings → Personal access tokens](https://www.figma.com/developers/api#access-tokens).

Other optional env vars:

```bash
export FIGMA_FILE_KEY=...                        # default Figma file
export FIGMA_PLUGIN_PORT=4010                    # WebSocket bridge port (scans 4010–4014)
export COMPONENT_REGISTRY_DIR=/path/to/registry  # component registry for codegen
```

## Manual config (advanced)

If you skip the installer and want to wire the server up yourself, point your CLI at `dist/index.js` (from `npm run build`) or `~/.figma-design-pipeline/server/index.js` (from the installer).

### Claude Code

```json
{
  "mcpServers": {
    "figma-design-pipeline": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "$FIGMA_ACCESS_TOKEN"
      }
    }
  }
}
```

### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "figma-design-pipeline": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "$FIGMA_ACCESS_TOKEN"
      }
    }
  }
}
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers."figma-design-pipeline"]
command = "node"
args = ["/absolute/path/to/dist/index.js"]
env = { FIGMA_ACCESS_TOKEN = "$FIGMA_ACCESS_TOKEN" }
startup_timeout_ms = 30000
```

## Uninstall

```bash
# Remove installed assets
rm -rf ~/.figma-design-pipeline

# Claude Code
claude mcp remove --scope user figma-design-pipeline
rm -rf ~/.claude/skills/figma-design-pipeline

# Codex CLI — remove the BEGIN/END block from ~/.codex/config.toml
rm -rf ~/.codex/skills/figma-design-pipeline

# Gemini CLI — remove the mcpServers."figma-design-pipeline" entry from ~/.gemini/settings.json
rm -rf ~/.gemini/skills/figma-design-pipeline
```

## Troubleshooting

**`figma_plugin_status` reports `connected: false`.**
- Confirm Figma Desktop is open and the plugin is running (not just imported).
- Check the plugin panel — it should say "Connected".
- The bridge scans ports 4010–4014. If something else holds all five, set `FIGMA_PLUGIN_PORT` to a different start port.

**`npx` install fails with `EACCES` or permission errors.**
- Don't run with `sudo` — `npm` should target your home dir. If a previous global install left wrong ownership, run `sudo chown -R "$(whoami)" ~/.npm`.

**Server fails to start: "Node version not supported".**
- This package targets Node 24+. Upgrade with `nvm install 24 && nvm use 24`.

**Tools don't appear in Claude Code / Codex / Gemini.**
- Restart the CLI after install. MCP server registration is read at startup.
- Confirm the registration: see [Verify the install](#3-verify-the-install).

**Codex MCP entry points at `~/.npm/_npx/...` instead of `~/.figma-design-pipeline/...`.**
- That entry was written by an older Codex/MCP integration. Run the installer again — it rewrites the managed block.

For anything else, open an issue at [github.com/spfr/figma-design-pipeline/issues](https://github.com/spfr/figma-design-pipeline/issues).
