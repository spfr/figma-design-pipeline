# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**@spicefactory/figma-design-pipeline** — an AI design assistant MCP server that works alongside the official Figma MCP. Provides design intelligence (inspection, auditing, planning, token sync, code generation) while the official Figma MCP handles all reads and writes to Figma via OAuth.

## Commands

```bash
npm run dev              # Start MCP server in dev mode (tsx src/index.ts)
npm run build            # Build server bundle via esbuild → dist/index.js
npm run check            # TypeScript type checking (tsc --noEmit)
npm test                 # Run tests (vitest run)
npm run test:watch       # Watch mode tests
npm run install:clients  # Build + register MCP server for Claude/Codex/Gemini
```

## Architecture

### Two MCP Servers Working Together

```
User request ("design me a dashboard")
    ↓
AI Agent (Claude Code, Codex, Gemini)
    ├─ Official Figma MCP ──→ Figma (OAuth, full read/write)
    │   use_figma, create_new_file, get_design_context,
    │   search_design_system, Code Connect, etc.
    │
    └─ This MCP Server ──→ Design Intelligence (local)
        figma_get_tree, figma_audit, figma_extract_tokens,
        figma_plan_*, figma_map_components, figma_export_tokens, etc.
```

The official Figma MCP handles all Figma I/O (no token needed for Claude users).
This server provides structured analysis, planning, and code generation.

### Build System

Single esbuild bundle: `src/index.ts` → `dist/index.js` (Node ESM, standalone).

### Source Layout

- `src/index.ts` — MCP server entry point, registers all tools and resources
- `src/tools/` — 15 MCP tool implementations across 3 categories:
  - `inspect/` — read-only tools using Figma REST API (get-tree, audit, extract-tokens, export-images, find-nodes, get-components, get-styles, diff-tokens)
  - `organize/` — planning tools, no mutations (rename-plan, group-plan, layout-plan, component-plan)
  - `codegen/` — code generation (map-components, generate-page, generate-schema, export-tokens)
- `src/analysis/` — Node classification (20 categories), token extraction with Tailwind mapping, layout analysis, pattern detection
- `src/codegen/` — Astro page templates, CMS schema generation, Tailwind config export, component registry
- `src/pipeline/snapshot.ts` — LRU snapshot cache (30 entries, 15min TTL)
- `src/shared/` — Types, Zod schemas, REST client, URL parsing, naming utilities
- `skill/SKILL.md` — Design assistant skill (orchestrates official Figma MCP + local tools + browser tools)

### Key Design Decisions

- **FIGMA_ACCESS_TOKEN is optional**: All major CLIs (Claude Code, Codex, Gemini) support the official Figma MCP via OAuth. The token is only needed for this server's REST API analysis tools.
- **No custom Figma plugin**: All writes go through the official Figma MCP's `use_figma` tool.
- **Plan tools return action arrays**: These describe what to do, which the AI then executes via `use_figma`.
- **Tree auto-truncation at 80KB**: `figma_get_tree` progressively prunes deeper children.
- **Audit cap**: Max 100 violations by default.
- **diff-tokens accepts style data as input**: Caller provides Figma style data (from official MCP or REST API), tool does the comparison.

### Environment Variables

Passed via MCP client config:
- `FIGMA_ACCESS_TOKEN` (optional) — Figma personal access token for REST API analysis tools
- `FIGMA_FILE_KEY` — Default file key
- `COMPONENT_REGISTRY_DIR` — Component registry dir (default: `$CWD/registry`)

## Release

See `PUBLISHING.md` for release process and `RELEASE-CHECKLIST.md` for the full flow.
