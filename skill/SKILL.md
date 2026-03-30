---
name: figma-design-pipeline
description: Use the Figma MCP pipeline with a thin, on-demand workflow: inspect first, then load only the mutation, token, or codegen guidance you actually need.
allowed-tools:
  - mcp__figma-design-pipeline__figma_get_tree
  - mcp__figma-design-pipeline__figma_audit
  - mcp__figma-design-pipeline__figma_extract_tokens
  - mcp__figma-design-pipeline__figma_export_images
  - mcp__figma-design-pipeline__figma_find_nodes
  - mcp__figma-design-pipeline__figma_get_components
  - mcp__figma-design-pipeline__figma_get_styles
  - mcp__figma-design-pipeline__figma_get_local_styles
  - mcp__figma-design-pipeline__figma_push_tokens
  - mcp__figma-design-pipeline__figma_diff_tokens
  - mcp__figma-design-pipeline__figma_plan_naming
  - mcp__figma-design-pipeline__figma_plan_grouping
  - mcp__figma-design-pipeline__figma_plan_layout
  - mcp__figma-design-pipeline__figma_plan_components
  - mcp__figma-design-pipeline__figma_apply_batch
  - mcp__figma-design-pipeline__figma_verify
  - mcp__figma-design-pipeline__figma_rollback
  - mcp__figma-design-pipeline__figma_map_components
  - mcp__figma-design-pipeline__figma_generate_page
  - mcp__figma-design-pipeline__figma_generate_schema
  - mcp__figma-design-pipeline__figma_export_tokens
  - Read
  - Glob
  - Grep
---

# Figma Design Pipeline

Use this skill only when the task needs Figma design inspection, mutation, token sync, or code generation.

## Activation Rules

- Start with the smallest relevant tool call. Do not load full reference material by default.
- Treat `figma_get_tree` and `figma_find_nodes` as the default entry points.
- Load only one workflow guide resource at a time:
  - `figma://inspect` for read-only structure work
  - `figma://mutate` for any write path
  - `figma://tokens` for token extraction, diff, export, or push
  - `figma://codegen` for component mapping or template/schema generation
- Load `figma://actions` only when composing or reviewing mutation actions.

## Default Workflow

1. Inspect first with `figma_get_tree`, `figma_find_nodes`, or `figma_audit`.
2. Decide which path applies: inspect, mutate, tokens, or codegen.
3. Read the matching `figma://...` resource only if that path is needed.
4. For mutations, always dry-run before apply and verify after apply.

## Hard Rules

- Do not read `figma://actions` unless a write path is active.
- Do not use plugin-dependent tools unless the task actually needs local styles or mutations.
- Prefer focused node IDs over full-file tree fetches.
- If the user only needs understanding or diagnosis, stay on the inspect path.
