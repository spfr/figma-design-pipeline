# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**@spicefactory/figma-design-pipeline** — an AI design assistant MCP server with a high-performance Figma plugin. Provides design intelligence (inspection, auditing, planning, token sync, code generation) plus a WebSocket-based plugin for 30-60x faster Figma writes than `use_figma`.

## Commands

```bash
npm run dev              # Start MCP server in dev mode (tsx src/index.ts)
npm run build            # Build server + plugin
npm run build:server     # Server only → dist/index.js
npm run build:plugin     # Plugin only → plugin/dist/
npm run check            # TypeScript type checking (tsc --noEmit)
npm test                 # Run tests (vitest run)
npm run test:watch       # Watch mode tests
npm run install:clients  # Build + register MCP server for Claude/Codex/Gemini
```

## Architecture

```
AI Agent (Claude Code / Codex / Gemini)
    │
    ├─ Official Figma MCP ──→ Figma (OAuth, create files, query state)
    │
    ├─ This MCP Server ─────→ Design intelligence + plugin bridge
    │   ├─ Analysis tools (REST API): get-tree, audit, extract-tokens, etc.
    │   ├─ Planning tools: plan-naming, plan-layout, plan-components
    │   ├─ Codegen tools: map-components, generate-page, export-tokens
    │   └─ Plugin bridge (WebSocket, port 4010-4014)
    │         ↕ WebSocket
    │       Figma Plugin (batch executor, 43 action types)
    │
    └─ Browser Tools ───────→ Website capture & analysis
```

### How writes work

1. **Plugin connected** → `figma_execute` sends batch actions via WebSocket to the plugin. 50 operations in one call (~200ms) vs 50 separate `use_figma` calls (~50s).
2. **Plugin not connected** → `figma_execute` returns fallback JavaScript for `use_figma`. Or use `use_figma` / `create_new_file` directly.

### Build System

Two esbuild bundles:
- **Server**: `src/index.ts` → `dist/index.js` (Node ESM, standalone)
- **Plugin**: `plugin/code.ts` → `plugin/dist/code.js` (Browser, IIFE, ES2017)

### Source Layout

- `src/index.ts` — MCP server entry point, registers 18 tools and workflow resources
- `src/tools/` — MCP tool implementations:
  - `inspect/` — read-only (get-tree, audit, extract-tokens, export-images, find-nodes, get-components, get-styles, diff-tokens)
  - `organize/` — planning (rename-plan, group-plan, layout-plan, component-plan)
  - `codegen/` — code generation (map-components, generate-page, generate-schema, export-tokens)
  - `plugin/` — plugin bridge tools (execute, status)
- `src/plugin/` — Bridge server and batch compiler
- `src/analysis/` — Node classification, token extraction, layout analysis, pattern detection
- `src/codegen/` — Astro templates, CMS schemas, component registry
- `src/pipeline/snapshot.ts` — LRU snapshot cache (30 entries, 15min TTL)
- `src/shared/` — Types, Zod schemas, color utilities, REST client, URL parsing, naming
- `plugin/` — Figma plugin source (code.ts, ui.html, manifest.json)
- `skill/SKILL.md` — Design assistant skill

### Key Design Decisions

- **FIGMA_ACCESS_TOKEN is optional**: All major CLIs support the official Figma MCP via OAuth. The token is only needed for this server's REST API analysis tools.
- **Plugin bridge is optional but recommended**: When connected, `figma_execute` is 30-60x faster. When not, it falls back to generating `use_figma` JS.
- **Plan tools return action arrays**: Validated against Zod schemas, can be executed via `figma_execute` or `use_figma`.
- **Tree auto-truncation at 80KB**: `figma_get_tree` progressively prunes deeper children.
- **diff-tokens accepts style data as input**: No REST API or plugin needed.

### Environment Variables

Passed via MCP client config:
- `FIGMA_ACCESS_TOKEN` (optional) — Figma personal access token for REST API analysis tools
- `FIGMA_FILE_KEY` — Default file key
- `FIGMA_PLUGIN_PORT` — WebSocket bridge port (default: 4010, scans 4010-4014)
- `COMPONENT_REGISTRY_DIR` — Component registry dir (default: `$CWD/registry`)

## Release

See `PUBLISHING.md` for release process and `RELEASE-CHECKLIST.md` for the full flow.
