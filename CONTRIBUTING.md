# Contributing

Thanks for contributing to SPFR Figma Design Pipeline.

## Prerequisites

- **Node 24 LTS or newer.** `engines.node: ">=24.0.0"`.
- We use TypeScript 6, zod 4, esbuild 0.28.

## Development

```bash
npm install
npm run check          # TypeScript type checking (tsc --noEmit)
npm test               # Run tests (vitest)
npm run build          # Build server + plugin
npm run build:server   # Server only -> dist/index.js
npm run build:plugin   # Plugin only -> plugin/dist/
npm run dev            # Run the MCP server with tsx
```

## Testing

```bash
# Install for your CLI
npm run install:clients

# Test the MCP server starts
timeout 2 node dist/index.js

# Test the plugin in Figma Desktop
# Plugins > Development > Import plugin from manifest > plugin/dist/manifest.json
```

## Before Opening a PR

1. Run `npm run check` and `npm test`
2. Run `npm run build` — both server and plugin must build cleanly
3. If you changed the plugin, smoke-test it in Figma Desktop
4. If you added action types, update: `src/shared/actions.ts`, `plugin/code.ts`, `src/tools/plugin/execute.ts` (fallback JS), and the ACTION_REFERENCE in `src/index.ts`
5. If you changed packaging, run `npm pack` and verify contents

## Scope

This repo covers:

- MCP server with 18 tools (inspect, plan, codegen, plugin bridge)
- Figma plugin (43 action types, WebSocket bridge, batch execution)
- Design assistant skill (SKILL.md)
- Installers for Claude Code, Codex CLI, Gemini CLI
- Token export (Tailwind, CSS, JSON, Style Dictionary)
