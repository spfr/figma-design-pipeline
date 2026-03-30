# SPFR Figma Design Pipeline

Install the Figma-side executor for SPFR Figma Design Pipeline.

Use it to apply safe, structured changes to Figma files from local AI tools such as Claude Code, Codex, Gemini CLI, and Claude Desktop.

This plugin is designed for teams that want a local, inspectable workflow.

## What it does

- Executes write operations against the current Figma file through the local plugin API
- Supports dry-run, apply, verify, and rollback mutation flows
- Enables local style reads and token-sync workflows
- Works alongside the MCP server used by local AI coding clients

## What it does not do by itself

- It is not a hosted SaaS
- It does not replace the MCP server install
- Read-only inspection and planning can work without the plugin

## Setup

1. Install this plugin from the Figma Community
2. Install the MCP package locally:

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

3. Set your `FIGMA_ACCESS_TOKEN`
4. Open the plugin in Figma desktop when you want to run write or token-sync workflows

## Local bridge note

This plugin connects only to a local MCP bridge running on `127.0.0.1` on the user's own machine. The workflow runs locally.
