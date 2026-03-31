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
- After `set_layout_mode`, always set `set_child_layout_sizing` on every child (FILL/HUG/FIXED)
- Use `set_constraints` for responsive pinning, `set_min_max_size` for responsive boundaries
- Slash naming: `Button/Primary/Default`, `Section/Hero`
- Create styles then `apply_style` to bind them — not raw color values
- Use `set_description` on every component for documentation
- 60-30-10 color rule (neutral/primary/accent)
- WCAG AA contrast: 4.5:1 normal text, 3:1 large text
- Minimum 44x44px touch targets

### Variant Naming Convention
Before `create_component_set`, name each component with property pairs:
`"Size=sm, State=default, Style=primary"` — Figma derives the Properties panel from these names.

After creating a component, use `define_component_property` for exposed Text/Boolean/InstanceSwap props.

## Design Constants

Use these exact values — do not improvise alternatives.

### Type Scale
| Name | Size / Line-height | Letter-spacing | Weight | Notes |
|------|-------------------|----------------|--------|-------|
| Display | 72px / 80px | -1.5px | 700 | |
| H1 | 48px / 56px | -1px | 700 | |
| H2 | 36px / 44px | -0.5px | 600 | |
| H3 | 28px / 36px | 0 | 600 | |
| H4 | 22px / 32px | 0 | 600 | |
| Body Large | 18px / 28px | 0 | 400 | |
| Body | 16px / 24px | 0 | 400 | |
| Body Small | 14px / 20px | 0 | 400 | |
| Caption | 12px / 16px | 0.4px | 400 | |
| Overline | 11px / 16px | 1.5px | 500 | UPPERCASE |

### Elevation Scale
- Level 1 (cards): `{ type: "DROP_SHADOW", radius: 3, color: {r:0,g:0,b:0,a:0.12}, offset: {x:0,y:1} }`
- Level 2 (dropdowns): `{ type: "DROP_SHADOW", radius: 6, color: {r:0,g:0,b:0,a:0.10}, offset: {x:0,y:4} }`
- Level 3 (modals): `{ type: "DROP_SHADOW", radius: 15, color: {r:0,g:0,b:0,a:0.12}, offset: {x:0,y:10} }`
- Level 4 (toasts): `{ type: "DROP_SHADOW", radius: 25, color: {r:0,g:0,b:0,a:0.15}, offset: {x:0,y:20} }`

### Spacing Scale (4px base)
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96

### Border Radius
sm: 4px (inputs, badges), md: 8px (cards, buttons), lg: 12px (modals), xl: 16px (large cards), 2xl: 24px (hero), full: 9999px (pills, avatars)

### Child Layout Sizing Patterns
After `set_layout_mode`, always specify sizing on children:
- Button label: HUG / HUG
- Button container: HUG / HUG
- Card content area: FILL / HUG
- Sidebar: FIXED width / FILL height
- Main content: FILL / FILL
- Table cell: FILL / HUG
- Chart placeholder: FILL / FIXED height

## Page Organization
When creating a full design file, create pages with `create_page` + `switch_page`:
1. **Cover** — title, version, status
2. **Design Tokens** — color, typography, spacing documentation
3. **Components** — atoms, molecules, organisms
4. **Patterns** — common layout compositions
5. **[Feature]** — actual screen designs

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

### Dashboard (1440px wide)
```
Top Bar (h:64, horizontal, FILL width)
  → Breadcrumb (HUG) + Spacer (FILL) + Date Picker + Export Btn + Avatar

Metrics Row (horizontal, gap:16, wrap)
  → Metric Card x4 (min-w:240, FILL)
    vertical, padding:20, radius:md, Level 1 shadow
    - Label (Caption, UPPERCASE, text-secondary)
    - Value Row: H2 number + Trend Badge (▲12% green / ▼3% red)
    - Sparkline (h:32, FILL width)

Charts Row (horizontal, gap:16)
  → Main Chart (2/3, h:360, radius:lg, Level 1 shadow)
    - Header: Title (H4) + Spacer + Period Tabs
    - Chart Area (FILL/FILL, placeholder with grid lines)
    - Legend (horizontal, colored dots + labels)
  → Side Chart (1/3, h:360, donut/bar placeholder)

Data Table (FILL, radius:lg, Level 1 shadow)
  → Header Row (h:48, bg:neutral-50)
    Checkbox + Column headers (Caption, font-medium) + Sort icons
  → Body Rows x8 (h:52, border-bottom:neutral-200)
    Checkbox + Data (Body Small) + Status Badge (radius:full) + Action icons
  → Footer (h:52): "Showing 1-10 of 234" + Pagination
```

### Settings Page
```
Horizontal, FILL/FILL
  → Sidebar (w:240, vertical, border-right)
    Section labels (Overline) + Nav items (icon + label, h:36)
  → Content (FILL, vertical, padding:32 48, gap:32)
    Page header + Form sections (2-col grid) + Danger zone + Save footer
```

## Token Sync & Code Generation

After designs are created or updated:

- **Extract**: `figma_extract_tokens` → structured colors, fonts, spacing, radii, shadows with Tailwind mapping
- **Export**: `figma_export_tokens` → Tailwind config, CSS variables, or JSON
- **Compare**: `figma_diff_tokens` → find drift between code and Figma
- **Map**: `figma_map_components` → match Figma nodes to code components
- **Generate**: `figma_generate_page` → page template from Figma design
- **Audit**: `figma_audit` → verify naming, layout, accessibility after changes
