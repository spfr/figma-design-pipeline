# Usage

This guide shows the most useful workflows. The installed design assistant skill (`figma-design-pipeline`) handles tool routing automatically when you describe what you want — you usually don't need to call tools by name.

For the full installation guide, see [INSTALL.md](INSTALL.md).

## Quick wins

Open Claude Code, Codex CLI, or Gemini CLI and type any of these:

```
Look at https://stripe.com and extract their design language into a new Figma file.

Create a dark-mode analytics dashboard with sidebar nav, four metric cards, and a line chart.

Audit https://figma.com/design/ABC123/My-File for naming, layout, and accessibility issues.

Export the design tokens from this Figma file as a Tailwind config:
https://figma.com/design/ABC123/Tokens

Generate Astro page templates from this Figma frame, matched to our components/ folder.
```

The skill picks the right tools. Read on if you want to drive specific tools yourself.

## Tool routing rules

| You want to… | Tool | Server |
|---|---|---|
| Create / modify / style any node | `figma_execute` | this package |
| Read-only JS queries (Figma plugin API) | `use_figma` | official Figma MCP |
| Create a new Figma file | `create_new_file` | official Figma MCP |
| Take a screenshot | `get_screenshot` | official Figma MCP |
| Inspect / audit / extract tokens | `figma_get_tree`, `figma_audit`, etc. | this package |

**Never use `use_figma` to write.** Even when the plugin is disconnected, `figma_execute` returns fallback JavaScript you can feed back into `use_figma` — that's still the right entry point.

Always call `figma_plugin_status` first when starting a write-heavy task. It tells you whether the plugin bridge is live (30-60x faster) or whether the agent should plan around fallback JS.

## Inspect (read-only, no plugin needed)

These all hit the Figma REST API. They need `FIGMA_ACCESS_TOKEN` set in your MCP server env (see [INSTALL.md](INSTALL.md)).

| Tool | What it does | When to use |
|---|---|---|
| `figma_get_tree` | Enriched node tree with classifications and layout info. Auto-truncates at 80 KB. | First call when exploring any file. |
| `figma_audit` | Structural audit: naming, layout, components, tokens, accessibility. | Bounded list of issues before a cleanup pass. |
| `figma_extract_tokens` | Colors, fonts, spacing, radius, shadows — with Tailwind mapping. | Token sync, theming, brand audits. |
| `figma_find_nodes` | Filter nodes by name / type / classification / text / size. | "Where is the button styled like X?" |
| `figma_get_components` | List published components. | Before mapping to your code components. |
| `figma_get_styles` | List published color/text/effect styles. | Token drift check. |
| `figma_diff_tokens` | Compare Figma styles vs your code tokens. | Sync workflow. Accepts style data directly — no REST call. |
| `figma_export_images` | Render nodes to PNG/JPG/SVG via REST. | Snapshots, before/after, docs. |

### Pattern: explore a file

```
1. figma_get_tree on the page frame, not the whole file
2. figma_audit to surface issues
3. figma_extract_tokens only if you actually need token detail
```

## Plan (analysis, no mutations)

These return *action arrays* — validated batches you can then run with `figma_execute`.

| Tool | What it plans |
|---|---|
| `figma_plan_naming` | Semantic renames for generic-named nodes (Rectangle 47 → Header/Logo). |
| `figma_plan_grouping` | Frame grouping for scattered elements. |
| `figma_plan_layout` | Auto-layout conversion from absolute positioning. |
| `figma_plan_components` | Component extraction from repeated patterns. |

Plans are reviewable: the agent inspects, edits, or filters before sending to `figma_execute`.

## Write (`figma_execute` — the fast path)

`figma_execute` batches up to 500 validated actions into a single round-trip. With the plugin connected, the bridge runs them in-process; without it, you get fallback JS for `use_figma`.

43 action types are available. Highlights:

- **Nodes**: `create_frame`, `create_text`, `create_component`, `create_instance`, `clone_node`, `delete_node`
- **Layout**: `set_auto_layout`, `set_child_layout_sizing` (FILL / HUG / FIXED), `set_constraints`, `move_node`, `resize_node`
- **Paint**: `set_fills`, `set_strokes`, `set_gradient_fill`, `set_effects`
- **Type**: `set_text_content`, `set_font`
- **Styles**: `create_paint_style`, `create_text_style`, `create_effect_style`, `apply_style`
- **Variables**: `create_variable_collection`, `create_variable`, `bind_variable`
- **Pages**: `create_page`, `switch_page`
- **Components**: `set_component_properties`, `swap_instance`

See the `figma://actions` MCP resource for the full schema.

### Example

```
figma_execute({
  actions: [
    { type: "create_page", name: "Dashboard" },
    { type: "create_frame", name: "Sidebar", parentId: "$ref:node-0", width: 240, height: 800 },
    { type: "create_text", parentId: "$ref:node-1", characters: "Analytics", fontSize: 24, name: "Sidebar/Title" }
  ],
  dryRun: false,
  stopOnError: true
})
```

`$ref:node-N` resolves to the Nth newly-created node within the same batch, so you can build trees in a single call.

### dryRun

Set `dryRun: true` to validate the action batch without applying it. Useful when an agent is composing a plan and wants to fail fast on schema issues before round-tripping to Figma.

## Codegen

| Tool | Output |
|---|---|
| `figma_map_components` | Match Figma nodes to your code components via signature. |
| `figma_generate_page` | Page template (defaults to Astro). |
| `figma_generate_schema` | CMS schema from Figma structure. |
| `figma_export_tokens` | Tokens as Tailwind config, CSS variables, JSON, or Style Dictionary. |

Set `COMPONENT_REGISTRY_DIR` to your code's registry directory so the agent knows what components exist on the code side.

## Common workflows

### 1. Create a design system from a website

```
"Look at https://linear.app and build a matching design system in a new Figma file."
```

Behind the scenes:
1. Browser tools capture the page (colors, fonts, spacing, components)
2. `create_new_file` makes the Figma file
3. `figma_execute` batch-creates paint styles, text styles, components
4. `figma_audit` verifies the result

### 2. Sync design tokens

```
"Sync design tokens from this Figma file to our Tailwind config."
```

1. `figma_get_styles` reads current Figma styles
2. `figma_diff_tokens` compares against your code's tokens
3. `figma_export_tokens` writes the format you want

### 3. Clean up a messy file

```
"Audit this Figma file and clean up naming and layout."
```

1. `figma_audit` finds issues
2. `figma_plan_naming` / `figma_plan_layout` produce action batches
3. `figma_execute` applies them (with the plugin) — or returns JS for `use_figma`
4. `figma_audit` confirms improvements

### 4. Generate code from a Figma page

```
"Generate Astro components from this Figma frame, mapped to our components/ folder."
```

1. `figma_get_tree` to understand structure
2. `figma_map_components` to match Figma nodes to your code
3. `figma_generate_page` to emit templates
4. `figma_export_tokens` to emit your token format

## Tips

- **Start with the plugin.** `figma_execute` is the only path to fast writes. If `figma_plugin_status` says disconnected, prompt to import the plugin before doing anything else write-heavy.
- **Stay focused with `figma_get_tree`.** It auto-truncates at 80KB. For deep files, drill into specific `nodeId`s rather than re-fetching the root.
- **Plans are reviewable.** `figma_plan_*` tools return action arrays — inspect them before piping to `figma_execute`.
- **Token sync without a token.** `figma_diff_tokens` accepts style data inline. You can paste data from the official Figma MCP and skip the REST API entirely.
