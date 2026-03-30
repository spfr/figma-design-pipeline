# SPFR Figma Design Pipeline

A two-way Figma automation system via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Inspect designs, plan changes, execute mutations, and generate code — from any MCP-compatible client.

Works with **Claude Code**, **Cursor**, **Windsurf**, **Cline**, **AntiGravity**, and any other MCP client.

## How It Works

```
Any MCP Client (Claude Code, Cursor, Windsurf, Cline, AntiGravity, ...)
    |
    v
MCP Server (Node.js, stdio)
    |--- Inspect tools ---> Figma REST API (read-only)
    |--- Plan tools ------> Local computation (no mutations)
    |--- Codegen tools ----> Local code generation
    |--- Mutate tools -----> WebSocket Bridge
                                |
                                v
                            Figma Plugin (runs inside Figma desktop)
                                |
                                v
                            Figma Scene Graph (actual mutations)
```

**Why two channels?** The Figma REST API is read-only for scene graph changes. Mutations (rename, move, resize, create components, etc.) require the Plugin API, which only runs inside Figma. The bridge connects the two via WebSocket.

## What You Can Do

**Design system organization** — Audit naming, batch-rename components, convert frames to components, group scattered elements into semantic sections, plan auto-layout conversion.

**Token sync** — Extract design tokens (colors, typography, spacing, shadows), compare them against code-defined tokens, push token changes back to Figma as styles, export as Tailwind config / CSS variables / JSON.

**Code generation** — Map Figma components to your codebase via signature matching, generate page templates, generate CMS content schemas, export tokens in your framework's format.

**Component creation** — Create frames, convert to components, build variant sets, create instances, set variant properties — all via batch actions with dry-run safety and rollback.

### Example Workflows

**Rename all components in a design system:**
```
1. figma_audit        — find naming violations
2. figma_plan_naming  — generate rename plan
3. figma_apply_batch  — dry-run, then apply
4. figma_verify       — confirm everything landed
```

**Extract and sync design tokens:**
```
1. figma_extract_tokens  — pull colors, fonts, spacing from Figma
2. figma_export_tokens   — export as Tailwind config
3. figma_diff_tokens     — compare code tokens vs Figma styles
4. figma_push_tokens     — push new tokens back to Figma as styles
```

**Convert a page design to code:**
```
1. figma_get_tree        — understand the page structure
2. figma_map_components  — match Figma nodes to code components
3. figma_generate_page   — generate the page template
4. figma_generate_schema — generate CMS content schema
```

## Quick Start

### 1. Install for Your Client

From source:

```bash
npm install
npm run install:clients
```

Published package:

```bash
npx -y -p @spfr/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

That command:
- builds a standalone MCP server bundle at `dist/index.js`
- builds the Figma plugin at `dist/plugin/`
- packages a Claude Desktop bundle at `dist/figma-design-pipeline.mcpb`
- deploys the Figma plugin to `~/.figma-design-pipeline/plugin/`
- registers the MCP server for supported local clients when their CLI is available

To target a specific client:

```bash
node scripts/install.mjs --client claude
node scripts/install.mjs --client gemini
node scripts/install.mjs --client codex
node scripts/install.mjs --client claude-desktop
```

### 2. Set Your Environment Variables

At minimum, the server needs:

```bash
export FIGMA_ACCESS_TOKEN=figd_your_token_here
```

Optional:

```bash
export FIGMA_FILE_KEY=...
export COMPONENT_REGISTRY_DIR=/path/to/project/registry
```

### 3. Load the Figma Plugin for Write Paths

Inspect, plan, and codegen tools work without the plugin. Mutations and local-style sync need the plugin.

1. Open Figma desktop
2. Go to **Plugins > Development > Import plugin from manifest...**
3. Select `~/.figma-design-pipeline/plugin/manifest.json`
4. Run the plugin

The plugin probes the preferred bridge port and the next few ports automatically, so local port conflicts no longer require rebuilding the plugin.

### 4. Claude Desktop

For Claude Desktop, install the packaged bundle from:

```text
dist/figma-design-pipeline.mcpb
```

Open **Settings > Extensions** in Claude Desktop and install that bundle.

## Publishable Distribution

This package is now structured to be published independently:

- npm package for the MCP server, installer, skill bundle, and Claude Desktop bundle
- Figma Community plugin for discovery and one-click installation inside Figma
- GitHub Actions workflow for npm trusted publishing

See [PUBLISHING.md](PUBLISHING.md) for the release checklist and positioning.

## Manual Config Snippets

If you prefer to register the server manually, use the standalone bundle at `dist/index.js`.

### Claude Code project config

```json
{
  "mcpServers": {
    "figma-design-pipeline": {
      "command": "node",
      "args": ["/absolute/path/to/figma-design-pipeline/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "$FIGMA_ACCESS_TOKEN",
        "FIGMA_FILE_KEY": "$FIGMA_FILE_KEY",
        "COMPONENT_REGISTRY_DIR": "$COMPONENT_REGISTRY_DIR"
      }
    }
  }
}
```

### Gemini CLI `~/.gemini/settings.json`

```json
{
  "mcpServers": {
    "figma-design-pipeline": {
      "command": "node",
      "args": ["/absolute/path/to/figma-design-pipeline/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "$FIGMA_ACCESS_TOKEN",
        "FIGMA_FILE_KEY": "$FIGMA_FILE_KEY",
        "COMPONENT_REGISTRY_DIR": "$COMPONENT_REGISTRY_DIR"
      }
    }
  }
}
```

### Codex CLI `~/.codex/config.toml`

```toml
[mcp_servers."figma-design-pipeline"]
command = "node"
args = ["/absolute/path/to/figma-design-pipeline/dist/index.js"]
env = { FIGMA_ACCESS_TOKEN = "$FIGMA_ACCESS_TOKEN", FIGMA_FILE_KEY = "$FIGMA_FILE_KEY", COMPONENT_REGISTRY_DIR = "$COMPONENT_REGISTRY_DIR" }
startup_timeout_ms = 30000
```

## MCP Tools

### Inspect (read-only, via REST API)

| Tool | Description |
|------|-------------|
| `figma_get_tree` | Fetch compact node tree (names, types, classifications, layout). Auto-truncates to 80KB. Use `figma_extract_tokens` for detailed tokens. |
| `figma_audit` | Structural audit: naming, layout, components, tokens, accessibility (WCAG). Capped at 100 violations by default. |
| `figma_extract_tokens` | Extract design tokens (colors, fonts, spacing, radius, shadows) with Tailwind mapping |
| `figma_export_images` | Export node renders as images via REST API — no plugin needed |
| `figma_find_nodes` | Search/filter nodes by name pattern, type, classification, text content, or size |
| `figma_get_components` | List all components in a file with names, descriptions, and node IDs |
| `figma_get_styles` | List all published styles (colors, text, effects, grids) in a file |

### Style Sync (read + write via plugin)

| Tool | Description |
|------|-------------|
| `figma_get_local_styles` | Read all local styles with full values (colors, fonts, shadows). Richer than REST API |
| `figma_push_tokens` | Create Figma styles from code-defined tokens (hex colors, fonts, effects) |
| `figma_diff_tokens` | Compare Figma styles vs provided tokens — reports drift (figmaOnly, codeOnly, changed, matched) |

### Plan (compute, no mutations)

| Tool | Description |
|------|-------------|
| `figma_plan_naming` | Generate semantic rename plan for generic/default-named nodes |
| `figma_plan_grouping` | Plan semantic frame grouping for scattered elements |
| `figma_plan_layout` | Plan auto-layout conversion from absolute positioning |
| `figma_plan_components` | Plan component extraction from repeated visual patterns |

### Mutate (write via plugin)

| Tool | Description |
|------|-------------|
| `figma_apply_batch` | Execute a batch of actions (dry-run by default). 29 action types. |
| `figma_verify` | Verify Figma state matches expected state after mutations |
| `figma_rollback` | Undo last batch via inverse actions |

### Codegen (generate code)

| Tool | Description |
|------|-------------|
| `figma_map_components` | Map Figma nodes to codebase components via signature matching |
| `figma_generate_page` | Generate a page template from organized Figma design |
| `figma_generate_schema` | Generate a CMS schema definition from Figma structure |
| `figma_export_tokens` | Export tokens as Tailwind config, CSS variables, or JSON |

## Mutation Actions

All actions use strict Zod schemas. Unknown keys cause validation errors. 29 action types:

### Scene Graph

| Action | Description |
|--------|-------------|
| `rename` | Rename a node |
| `move` | Reparent a node (`insertIndex` for position — 0 = back, omit = front) |
| `create_frame` | Create a new frame with optional size, fills, auto-layout |
| `delete_node` | Delete a node (requires `confirmed: true` safety flag) |
| `resize` | Set width and/or height |
| `set_position` | Set absolute x/y position |
| `duplicate_node` | Clone a node (returns the new node ID in the result) |
| `set_visible` | Show or hide a node |
| `set_opacity` | Set node opacity (0-1) |

### Layout

| Action | Description |
|--------|-------------|
| `set_layout_mode` | Set auto-layout direction: `HORIZONTAL`, `VERTICAL`, or `NONE` |
| `set_layout_positioning` | Set `AUTO` or `ABSOLUTE` within an auto-layout parent |
| `set_alignment` | Set `primaryAxisAlignItems` and/or `counterAxisAlignItems` |
| `set_spacing` | Set `itemSpacing` and padding (`top`, `right`, `bottom`, `left`) |

### Appearance

| Action | Description |
|--------|-------------|
| `set_fills` | Set solid color fills (array of `{ type, color, opacity? }`) |
| `set_strokes` | Set stroke color and weight |
| `set_effects` | Set drop shadows, inner shadows, layer/background blurs |
| `set_corner_radius` | Set border radius — uniform or per-corner `[tl, tr, br, bl]` |

### Text

| Action | Description |
|--------|-------------|
| `set_text_content` | Change text characters (auto-loads font) |
| `set_text_style` | Change font family, size, weight, line height, letter spacing |

### Components

| Action | Description |
|--------|-------------|
| `create_component_from_node` | Convert any frame/group into a reusable component |
| `create_component_set` | Combine components into a variant set |
| `create_instance` | Create an instance of a component |
| `swap_instance` | Replace an instance's main component |
| `set_component_properties` | Set variant, text, or boolean properties on an instance |

### Export

| Action | Description |
|--------|-------------|
| `export_node` | Export as PNG, SVG, PDF, or JPG (returns base64) |

### Styles

| Action | Description |
|--------|-------------|
| `get_local_styles` | Read all local paint/text/effect styles with full values |
| `create_paint_style` | Create a color style (use `/` separators for folder paths) |
| `create_text_style` | Create a text style (auto-loads font) |
| `create_effect_style` | Create a shadow or blur effect style |

> **For AI agents:** The full action schema reference is available as an MCP resource at `figma://actions`. Read it on-demand instead of memorizing schemas — keeps context lean.

### Example: Create Button Variants

```json
[
  // 1. Create a primary button frame
  { "type": "create_frame", "name": "Style=Primary", "parentId": "PAGE_ID", "width": 180, "height": 48 },
  // (get the new frame ID from the result, then...)

  // 2. Style the primary button
  { "type": "set_fills", "nodeId": "NEW_FRAME_ID", "fills": [
    { "type": "SOLID", "color": { "r": 0.2, "g": 0.4, "b": 1, "a": 1 } }
  ]},
  { "type": "set_corner_radius", "nodeId": "NEW_FRAME_ID", "radius": 8 },
  { "type": "set_layout_mode", "nodeId": "NEW_FRAME_ID", "mode": "HORIZONTAL" },
  { "type": "set_alignment", "nodeId": "NEW_FRAME_ID",
    "primaryAxisAlignItems": "CENTER", "counterAxisAlignItems": "CENTER" },

  // 3. Convert to component
  { "type": "create_component_from_node", "nodeId": "NEW_FRAME_ID", "name": "Style=Primary" },

  // 4. Duplicate for secondary variant
  { "type": "duplicate_node", "nodeId": "COMPONENT_ID" },
  // Rename + restyle the clone for "Style=Secondary"

  // 5. Combine into variant set
  { "type": "create_component_set", "componentIds": ["PRIMARY_ID", "SECONDARY_ID"], "name": "Button" },

  // 6. Create an instance and switch variants
  { "type": "create_instance", "componentId": "PRIMARY_ID", "parentId": "PARENT_ID" },
  { "type": "set_component_properties", "nodeId": "INSTANCE_ID", "properties": { "Style": "Secondary" } }
]
```

### Example: Batch Rename and Componentize

```json
{
  "actions": [
    { "type": "rename", "nodeId": "123:456", "name": "Card/Feature" },
    { "type": "rename", "nodeId": "123:789", "name": "Card/Team" },
    { "type": "create_component_from_node", "nodeId": "999:100", "name": "TagBand" },
    { "type": "create_component_from_node", "nodeId": "999:200", "name": "ShowcaseCard" }
  ],
  "dryRun": false
}
```

## Safe Lifecycle

The recommended workflow for mutations:

```
audit  -->  plan  -->  dry-run  -->  apply  -->  verify
                          ^                        |
                          |                        v
                          +--- rollback (if needed)
```

1. **Audit** the design structure to understand current state
2. **Plan** changes (rename, group, layout, components)
3. **Dry-run** the batch to preview what will happen
4. **Apply** the batch for real
5. **Verify** the result matches expectations
6. **Rollback** if something went wrong

Every applied batch gets a `batchId` that can be passed to `figma_rollback` to undo the changes via computed inverse actions. Not all actions are reversible (create/delete/export) — the rollback will skip those and report what it couldn't undo.

## Component Registry

The codegen tools use a **component registry** to map Figma nodes to your codebase components. The registry lives in **your project** (not this repo) at `registry/<name>-components.json`.

Each registry entry defines:

- Component name, path, and props
- A `figmaSignature` for automatic matching (keywords, size constraints, child patterns)
- `schemaFields` for CMS data binding

### Setup

1. **Generate** the registry from your project's component directories:

```bash
npx tsx scripts/generate-registry.ts /path/to/your-project default
# Creates /path/to/your-project/registry/default-components.json
```

2. **Configure** the registry path via `COMPONENT_REGISTRY_DIR` env var in your MCP config:

```json
{
  "env": {
    "FIGMA_ACCESS_TOKEN": "figd_...",
    "COMPONENT_REGISTRY_DIR": "/path/to/your-project/registry"
  }
}
```

3. **Use** the registry in codegen tools:

```
figma_map_components({ registry: "default", nodeId: "..." })
```

## Environment Variables

All environment variables are passed via your MCP client's configuration, CLI registration, or desktop bundle user config. There is no repo `.env` requirement.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIGMA_ACCESS_TOKEN` | Yes | - | [Figma personal access token](https://www.figma.com/developers/api#access-tokens) |
| `FIGMA_FILE_KEY` | No | - | Default file key (can also pass via `figmaUrl` parameter) |
| `BRIDGE_PORT` | No | `4010` | WebSocket bridge port (baked into plugin at build time) |
| `PIPELINE_STATE_DIR` | No | `~/.figma-pipeline` | State persistence directory |
| `COMPONENT_REGISTRY_DIR` | No | `$CWD/registry` | Component registry directory |

## Development

```bash
npm run dev          # Start MCP server in dev mode (tsx)
npm run build        # Build server + plugin
npm run check        # TypeScript type checking
npm test             # Run tests
npm run test:watch   # Watch mode
```

### Project Structure

```
figma-design-pipeline/
├── src/
│   ├── index.ts              # MCP server entry point + tool definitions
│   ├── analysis/             # Node classification, token extraction, layout analysis
│   ├── bridge/               # Express + WebSocket server, REST API client
│   ├── codegen/              # Astro/schema/Tailwind code generation
│   ├── pipeline/             # State management, snapshots, rollback
│   ├── plugin/               # Figma plugin (code.ts + manifest.json)
│   ├── shared/               # Types, action schemas (Zod), context, URL parsing
│   └── tools/                # 21 MCP tool implementations
│       ├── inspect/          # get-tree, audit, extract-tokens, export-images, find-nodes, get-components, get-styles
│       ├── organize/         # rename-plan, group-plan, layout-plan, component-plan
│       ├── mutate/           # apply-batch, verify, rollback, push-tokens, get-local-styles, diff-tokens
│       └── codegen/          # map-components, generate-page, generate-schema, export-tokens
├── registry/                 # Component registries (project-specific, gitignored)
├── scripts/                  # Build scripts (esbuild), registry generator
├── tests/                    # Test files
├── package.json
└── tsconfig.json
```

### Build Details

The build uses **esbuild** with two separate bundles:

- **Server** (`build-server.mjs`): Bundles `src/index.ts` to `dist/index.js` as a standalone Node target bundle
- **Plugin** (`build-plugin.mjs`): Bundles `src/plugin/code.ts` to `dist/plugin/code.js` (Browser target, IIFE)
- **Desktop bundle** (`package-desktop-extension.mjs`): Packages a Claude Desktop `.mcpb` bundle at `dist/figma-design-pipeline.mcpb`

The preferred bridge port is still injected at build time, but the plugin now probes the next few ports automatically if the preferred port is busy.

## Context-Efficient Design

Optimized to minimize LLM context window usage:

- **Compact tree output** — `figma_get_tree` strips per-node tokens, componentProperties, and variantProperties. Returns only structure, names, classifications, layout, and text content. Collapses groups of vector shapes (SVG paths) into a single summary node.
- **Auto-truncation** — If any tree response exceeds 80KB, deeper children are progressively pruned with `[N children omitted]` placeholders.
- **Audit cap** — `figma_audit` returns max 100 violations by default (configurable via `maxViolations`). Summary always reflects full counts.
- **LRU cache** — 15-minute TTL, max 30 entries, version-based invalidation after mutations. Prevents re-fetching during a design session.
- **Workflow resources** — `figma://inspect`, `figma://mutate`, `figma://tokens`, and `figma://codegen` keep the skill thin and let agents load only the workflow guidance they need.
- **MCP Resource `figma://actions`** — Full schema reference for all 29 action types. LLMs read this only when they need to write mutations, keeping the initial tool list lean.
- **Progressive disclosure** — Start with `figma_get_tree` to understand the design, then load only the specific workflow guide and action reference required for the next step.

## Troubleshooting

### Plugin won't connect

- Make sure the Figma **desktop** app is open (not the browser version)
- Check that the MCP server is running (the bridge starts automatically with the server)
- The plugin automatically probes the preferred bridge port and the next few ports. If you changed `BRIDGE_PORT`, rebuild so the preferred port matches your server config
- Try closing and re-running the plugin in Figma

### Mutation tools return "plugin not connected"

- Run the plugin in Figma (Plugins > Development > your plugin)
- The plugin UI should show "Connected" status
- Inspect tools (get_tree, audit, etc.) work without the plugin — only mutation and style sync tools need it

### Actions silently do nothing

- **Check the action schema carefully.** All schemas use `.strict()` — unknown keys are rejected. Common mistake: using `index` instead of `insertIndex` for `move` actions.
- Verify the `nodeId` exists on the current page. Use `figma_find_nodes` to search.
- For instance nodes: you can't directly modify most properties on instances. Modify the main component instead, or use `set_component_properties` for variant/text/boolean props.

### Cache showing stale data

- The LRU cache has a 15-minute TTL. After mutations, the cache is automatically invalidated for affected nodes.
- If you see stale data after manual Figma edits, wait for cache expiry or use a different nodeId to bypass cache.

### Tree response is too large

- Use `figma_get_tree` with a specific `nodeId` to focus on a subtree instead of the full page
- The auto-truncation kicks in at 80KB, pruning deeper children
- Use `figma_find_nodes` to locate specific nodes without fetching the full tree

## Known Limitations

- **Instance overrides**: Some properties on deeply nested instances can't be changed through the plugin. Fix the override at the component level instead.
- **Move action**: Uses `insertIndex` (not `index`). Zod's strict mode rejects unknown keys, so using `index` will cause a validation error.
- **Font loading**: Text mutations require the font to be available in Figma. The plugin loads fonts automatically but may fail for unavailable fonts.
- **Plugin must be running**: Mutation and style sync tools require the Figma plugin to be active and connected via WebSocket. Inspect and plan tools work without it (REST API only).
- **`figma_map_components` root-only**: Currently only matches the root node and its direct significant children. Does not recurse with manual hints applied to nested nodes.
- **Figma layer order**: `children[0]` = back/bottom of the layer stack, `children[last]` = front/top. The `insertIndex` in move actions follows this convention (0 = send to back).

## License

MIT
