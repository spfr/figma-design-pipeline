# SPFR Figma Design Pipeline

Figma-side executor for the SPFR Figma Design Pipeline MCP workflow.

Use it to apply safe, structured changes to Figma files from local AI coding tools such as Claude Code, Codex, and Gemini CLI.

## What it does

- Executes write operations against the current Figma file
- Supports safe mutation flows such as dry-run, apply, verify, and rollback
- Enables local style reads and token-sync workflows

## What it does not do by itself

- It is not a hosted SaaS
- It does not replace the MCP server install
- Read-only inspection can work without the plugin

## Setup

1. Install this plugin from the Figma Community
2. Install the MCP package locally:

```bash
npx -y -p @spfr/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

3. Set your `FIGMA_ACCESS_TOKEN`
4. Run the plugin in Figma desktop

## Local bridge note

This plugin connects only to a local MCP bridge running on `127.0.0.1` on the user's own machine.
