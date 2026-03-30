---
name: figma-design-pipeline
description: >
  Design intelligence and high-performance writes for Figma. Analyze websites, inspect and audit Figma files,
  extract and sync design tokens, plan improvements, generate code, and execute batch Figma mutations 30-60x
  faster via the plugin bridge (figma_execute). Call figma_plugin_status first to check if the plugin is connected.
  Also works alongside Figma write tools (use_figma, create_new_file) from the Figma integration in your environment.
allowed-tools:
  # Plugin tools (high-performance batch execution via Figma plugin)
  - mcp__figma-design-pipeline__figma_execute
  - mcp__figma-design-pipeline__figma_plugin_status
  # Analysis & codegen tools (figma-design-pipeline MCP)
  - mcp__figma-design-pipeline__figma_get_tree
  - mcp__figma-design-pipeline__figma_audit
  - mcp__figma-design-pipeline__figma_extract_tokens
  - mcp__figma-design-pipeline__figma_export_images
  - mcp__figma-design-pipeline__figma_find_nodes
  - mcp__figma-design-pipeline__figma_get_components
  - mcp__figma-design-pipeline__figma_get_styles
  - mcp__figma-design-pipeline__figma_diff_tokens
  - mcp__figma-design-pipeline__figma_plan_naming
  - mcp__figma-design-pipeline__figma_plan_grouping
  - mcp__figma-design-pipeline__figma_plan_layout
  - mcp__figma-design-pipeline__figma_plan_components
  - mcp__figma-design-pipeline__figma_map_components
  - mcp__figma-design-pipeline__figma_generate_page
  - mcp__figma-design-pipeline__figma_generate_schema
  - mcp__figma-design-pipeline__figma_export_tokens
  # File tools
  - Read
  - Glob
  - Grep
  - Write
---

# Figma Design Intelligence

This skill provides design analysis, planning, and code generation for Figma workflows. It works alongside your environment's Figma write tools — you use those to create and modify designs, and this skill to analyze, audit, plan, and generate code.

## High-Performance Plugin (figma_execute)

**At the start of any design task, call `figma_plugin_status` to check if the plugin is connected.**

When `connected: true`:
- **ALWAYS use `figma_execute` instead of `use_figma`** for creating styles, components, modifying nodes, batch operations. It sends actions directly to Figma via WebSocket — 30-60x faster.
- Still use `create_new_file` from the Figma MCP to create new files (the plugin can't create files).
- Still use `use_figma` for queries that need arbitrary JS (reading complex state, finding nodes by criteria).

When `connected: false`:
- `figma_execute` returns fallback JavaScript you can pass to `use_figma`.
- Or use `use_figma` / `create_new_file` directly.

Example — creating 10 color styles:
```
// With plugin: ONE call, ~200ms
figma_execute({ actions: [
  { type: "create_paint_style", name: "Brand/Primary", paints: [...] },
  { type: "create_paint_style", name: "Brand/Secondary", paints: [...] },
  // ... 8 more
]})

// Without plugin: TEN separate use_figma calls, ~10 seconds
```

## What This Skill Provides

| Task | Tool |
|------|------|
| Inspect a Figma file structure | `figma_get_tree`, `figma_find_nodes` |
| Audit a Figma file for quality | `figma_audit` |
| Extract design tokens | `figma_extract_tokens` |
| Export tokens as Tailwind/CSS/JSON | `figma_export_tokens` |
| Compare code tokens vs Figma | `figma_diff_tokens` |
| Plan naming improvements | `figma_plan_naming` |
| Plan layout improvements | `figma_plan_layout` |
| Plan component extraction | `figma_plan_components` |
| Plan grouping improvements | `figma_plan_grouping` |
| Map Figma to code components | `figma_map_components` |
| Generate page template code | `figma_generate_page` |
| Generate CMS schema | `figma_generate_schema` |
| Export node images | `figma_export_images` |

## Website Analysis for Design

When analyzing a website to extract its design language:

1. Navigate to the URL using browser tools
2. Take screenshots for visual reference
3. Extract computed styles via JavaScript:
   - **Colors**: query all elements for `color`, `backgroundColor`, `borderColor`, `borderTopColor`
   - **Typography**: collect `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`
   - **Spacing**: collect `padding*`, `margin*`, `gap`, `rowGap`, `columnGap`
   - **Radii**: collect `borderRadius`
   - **Shadows**: collect `boxShadow`
4. Post-process: deduplicate, cluster similar colors, identify the base spacing unit, derive scales
5. Identify component patterns (cards, buttons, navigation, heroes, testimonials, footers)

Synthesize findings into a structured token system that the Figma write tools can use to build a design system.

## Design System Guidance

When a design system needs to be created in Figma, provide this structure to the write tools:

### Token Architecture
- **Colors**: primary scale (50-900), secondary, neutrals (gray 50-900), semantic (success, warning, error, info)
- **Typography**: Display, H1-H4, Body Large, Body, Body Small, Caption, Overline — with font family, size, weight, line height
- **Spacing**: 4px base scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96)
- **Radii**: sm (4), md (8), lg (12), xl (16), full (9999)
- **Shadows**: sm, md, lg, xl elevation levels

### Component Hierarchy
- **Atoms**: Button (primary/secondary/ghost x sm/md/lg), Input, Badge, Avatar, Toggle
- **Molecules**: Form Field, Card, Nav Item, Search Bar
- **Organisms**: Navigation Bar, Hero, Feature Grid, Testimonials, CTA Section, Footer

### Figma Best Practices
- Auto-layout everywhere, never absolute positioning
- Slash naming: `Button/Primary/Default`, `Section/Hero`
- Create styles (paint, text, effect) — not raw color values
- 60-30-10 color rule (neutral/primary/accent)
- WCAG AA contrast: 4.5:1 normal text, 3:1 large text
- Minimum 44x44px touch targets

## Page Layout Patterns

### Landing Page (1440px wide)
```
Nav (h:72) → Logo + Links + CTA Button
Hero (h:600+) → Large Headline + Subtitle + 2 CTAs + Visual
Logo Bar → Customer/partner logos
Features → 3-4 column grid (icon + title + description)
How It Works → 3 numbered steps
Testimonials → Quote cards with avatar
CTA Section → Bold headline + Action button (contrasting bg)
Footer → Brand + Link columns + Social + Legal
```
Section padding: 80px vertical, content max-width 1280px.

### Dashboard
```
Top Bar (h:64) → Breadcrumb + Actions
Metrics Row → 3-4 cards (value + label + trend)
Charts → Main (2/3) + Side (1/3)
Data Table → Header + Rows + Pagination
```

## Token Sync & Code Generation

After designs are created or updated:

- **Extract**: `figma_extract_tokens` → structured colors, fonts, spacing, radii, shadows with Tailwind mapping
- **Export**: `figma_export_tokens` → Tailwind config, CSS variables, or JSON
- **Compare**: `figma_diff_tokens` → find drift between code and Figma
- **Map**: `figma_map_components` → match Figma nodes to code components
- **Generate**: `figma_generate_page` → page template from Figma design
- **Audit**: `figma_audit` → verify naming, layout, accessibility after changes
