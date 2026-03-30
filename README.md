# SPFR Figma Design Pipeline

AI design assistant for Figma. Analyze websites, create design systems, design pages and dashboards, sync tokens, and generate production code — all from your terminal.

Works with **Claude Code**, **Codex CLI**, and **Gemini CLI**. Uses the official Figma MCP for full read/write Figma access.

## What It Does

```
"Look at stripe.com and create a design system based on their style"

→ Captures the website, extracts colors, typography, spacing
→ Creates a new Figma file with organized design system
→ Builds color palette, type scale, spacing system, components
→ Everything appears in Figma — ready for your team
```

```
"Design me an analytics dashboard with sidebar nav, metrics cards, and charts"

→ Creates the page layout in Figma with proper auto-layout
→ Uses your existing design system components
→ Applies consistent spacing, colors, and typography
→ Produces a polished, designer-quality result
```

```
"Sync the design tokens from Figma to our Tailwind config"

→ Reads current Figma styles and variables
→ Compares against your code tokens
→ Exports as Tailwind config, CSS variables, or JSON
```

```
"Generate React components from this Figma page"

→ Maps Figma nodes to your codebase components
→ Generates page templates and CMS schemas
→ Exports design tokens in your framework's format
```

## How It Works

```
AI Agent (Claude Code / Codex / Gemini)
    │
    ├─ Official Figma MCP ──→ Read & write Figma (OAuth, zero setup)
    │
    ├─ This MCP Server ─────→ Design intelligence (analysis, planning, codegen)
    │
    └─ Browser Tools ───────→ Website capture & analysis
```

The official Figma MCP handles all Figma reads and writes via OAuth — no personal access token needed. This MCP server provides the design intelligence layer: structured inspection, auditing, planning, token sync, and code generation.

## Quick Start

### 1. Install (one command)

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

This registers the MCP server and installs the design assistant skill for all supported clients.

From source:

```bash
git clone https://github.com/spfr/figma-design-pipeline.git
cd figma-design-pipeline
npm install
npm run install:clients
```

### 2. Try it

Open Claude Code (or Codex/Gemini CLI) and type:

```
Create a new Figma file called "My Design System" with a color palette
using blue as the primary color and a 4px spacing scale
```

The AI will use the official Figma MCP to create the file and build the design system. No token, no plugin, no config.

More things to try:

```
Look at https://stripe.com and extract their design language into a new Figma file
```

```
Audit the Figma file at https://figma.com/design/ABC123/My-File?node-id=1:2
for naming issues and accessibility problems
```

```
Export the design tokens from this Figma file as a Tailwind config
```

### 3. Optional: REST API tools

All major CLIs support the official Figma MCP via OAuth — **no token needed** for Figma reads and writes.

If you also want to use this server's REST API analysis tools (structured tree inspection, token extraction, auditing), set:

```bash
export FIGMA_ACCESS_TOKEN=figd_your_token_here
```

Get a token from [Figma Settings > Personal access tokens](https://www.figma.com/developers/api#access-tokens).

Other optional env vars:

```bash
export FIGMA_FILE_KEY=...                        # Default Figma file
export COMPONENT_REGISTRY_DIR=/path/to/registry  # Component registry for codegen
```

## MCP Tools

### Inspect (read-only, via REST API)

| Tool | Description |
|------|-------------|
| `figma_get_tree` | Fetch enriched node tree with classifications, layout info. Auto-truncates at 80KB. |
| `figma_audit` | Structural audit: naming, layout, components, tokens, accessibility. |
| `figma_extract_tokens` | Extract design tokens (colors, fonts, spacing, radius, shadows) with Tailwind mapping. |
| `figma_export_images` | Export node renders as images via REST API. |
| `figma_find_nodes` | Search/filter nodes by name, type, classification, text, or size. |
| `figma_get_components` | List all components with names, descriptions, and node IDs. |
| `figma_get_styles` | List all published styles in a file. |
| `figma_diff_tokens` | Compare Figma styles vs code tokens. Reports drift. |

### Plan (analysis, no mutations)

| Tool | Description |
|------|-------------|
| `figma_plan_naming` | Generate semantic rename plan for generic-named nodes. |
| `figma_plan_grouping` | Plan semantic frame grouping for scattered elements. |
| `figma_plan_layout` | Plan auto-layout conversion from absolute positioning. |
| `figma_plan_components` | Plan component extraction from repeated visual patterns. |

### Codegen

| Tool | Description |
|------|-------------|
| `figma_map_components` | Map Figma nodes to codebase components via signature matching. |
| `figma_generate_page` | Generate page template from Figma design. |
| `figma_generate_schema` | Generate CMS schema from Figma structure. |
| `figma_export_tokens` | Export tokens as Tailwind config, CSS variables, or JSON. |

### Writing to Figma

All writes use the official Figma MCP's `use_figma` tool, which executes Figma Plugin API JavaScript directly. The plan tools generate action descriptions that the AI agent translates into `use_figma` calls.

## Example Workflows

### Create a Design System from a Website

```
1. Browse the website using browser tools
2. Extract colors, fonts, spacing, component patterns
3. create_new_file → new Figma file
4. use_figma → create color styles, text styles, components
5. figma_audit → verify the result
```

### Sync Design Tokens

```
1. figma_get_styles → read current Figma styles
2. figma_diff_tokens → compare against code tokens
3. figma_export_tokens → export as Tailwind/CSS/JSON
```

### Clean Up a Design File

```
1. figma_audit → find naming issues, layout problems
2. figma_plan_naming → generate rename plan
3. figma_plan_layout → plan auto-layout conversion
4. use_figma → execute the plans
5. figma_audit → verify improvements
```

### Generate Code from Figma

```
1. figma_get_tree → understand the design structure
2. figma_map_components → match to codebase components
3. figma_generate_page → generate page template
4. figma_export_tokens → export tokens in your format
```

## Component Registry

The codegen tools use a component registry to map Figma nodes to your codebase. Set `COMPONENT_REGISTRY_DIR` to your project's registry directory.

## Manual Config

If you prefer manual setup, use the standalone bundle at `dist/index.js`:

### Claude Code

```json
{
  "mcpServers": {
    "figma-design-pipeline": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "$FIGMA_ACCESS_TOKEN"
      }
    }
  }
}
```

### Gemini CLI

```json
{
  "mcpServers": {
    "figma-design-pipeline": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "$FIGMA_ACCESS_TOKEN"
      }
    }
  }
}
```

### Codex CLI

```toml
[mcp_servers."figma-design-pipeline"]
command = "node"
args = ["/path/to/dist/index.js"]
env = { FIGMA_ACCESS_TOKEN = "$FIGMA_ACCESS_TOKEN" }
startup_timeout_ms = 30000
```

## Development

```bash
npm run dev          # Start MCP server in dev mode
npm run build        # Build server bundle
npm run check        # TypeScript type checking
npm test             # Run tests
npm run test:watch   # Watch mode
```

## Publishing

See [PUBLISHING.md](PUBLISHING.md) for the release process.

## License

MIT
