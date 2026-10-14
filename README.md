# SPFR Figma Design Pipeline — DEPRECATED

> [!WARNING]
> **This project is deprecated and no longer maintained.** Use the official **[Figma MCP server](https://developers.figma.com/docs/figma-mcp-server/)** instead.
> The npm package `@spicefactory/figma-design-pipeline` is deprecated and this repository is archived.

This project bridged gaps in the early Figma MCP: it had no reliable write path, no design-system search, and no website-to-design capture. The official remote Figma MCP server now covers all of these. Its `use_figma` tool runs Figma Plugin API code directly. One call can create and edit many nodes, so a separate plugin bridge isn't needed anymore.

## Migrating to the official Figma MCP

Set up the official server by following [Figma's MCP guide](https://developers.figma.com/docs/figma-mcp-server/). For Claude Code, install the Figma plugin, which bundles the server and its skills (`figma-use`, `figma-generate-design`, `figma-generate-library`, `figma-design-to-code`, …).

| This project | Official Figma MCP |
|---|---|
| `figma_execute` + plugin bridge (batched writes) | `use_figma` — Plugin API JS, many operations per call ([write to canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas)) |
| `figma_plugin_status` | Not needed (no local plugin) |
| `figma_get_tree`, `figma_find_nodes` | `get_metadata`, `use_figma` (read-only queries) |
| `figma_get_components`, `figma_get_styles` | `search_design_system`, `get_libraries`, `get_variable_defs` |
| `figma_extract_tokens`, `figma_export_tokens`, `figma_diff_tokens` | `get_variable_defs`, `use_figma` (read variables) |
| `figma_export_images` | `download_assets`, `get_screenshot` |
| `figma_audit`, `figma_plan_*` | `get_metadata` / `use_figma` reads; the agent plans and applies changes via `use_figma` |
| `figma_map_components` | Code Connect (`get_code_connect_map`, `add_code_connect_map`) |
| `figma_generate_page`, `figma_generate_schema` | `get_design_context` (design → code) |
| Browser capture → design system | `generate_figma_design` (live web UI → Figma layers) |
| Create files | `create_new_file` |

Full tool list: [Figma MCP tools and prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts).

## Uninstalling

Remove everything the installer set up:

```bash
# MCP server registrations
claude mcp remove figma-design-pipeline --scope user   # Claude Code
gemini mcp remove figma-design-pipeline                # Gemini CLI (or delete the entry under mcpServers in ~/.gemini/settings.json)
# Codex CLI: delete the block between "# BEGIN figma-design-pipeline" and "# END figma-design-pipeline" in ~/.codex/config.toml

# Skill symlinks and installed assets
rm -rf ~/.claude/skills/figma-design-pipeline \
       ~/.codex/skills/figma-design-pipeline \
       ~/.agents/skills/figma-design-pipeline \
       ~/.gemini/skills/figma-design-pipeline \
       ~/.figma-design-pipeline
```

In Figma Desktop, remove the **SPFR Design Pipeline** development plugin from **Plugins → Development → Manage plugins in development**.

## Historical docs

The final release was **0.8.0** (2026-05-12). Earlier documentation is kept for reference: [INSTALL.md](INSTALL.md), [USAGE.md](USAGE.md), [CHANGELOG.md](CHANGELOG.md).

## License

MIT
