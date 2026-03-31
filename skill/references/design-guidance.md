# Figma Design Guidance

Load this reference only when the task needs detailed synthesis or structure for design creation.

## Website Analysis

When extracting a design language from a website:

1. Capture the page visually with screenshots.
2. Extract computed styles for colors, typography, spacing, radii, and shadows.
3. Deduplicate values, derive scales, and identify repeated UI patterns.
4. Convert findings into a token system the Figma write tools can apply.

Recommended style buckets:
- Colors: `color`, `backgroundColor`, `borderColor`, `borderTopColor`
- Typography: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`
- Spacing: `padding*`, `margin*`, `gap`, `rowGap`, `columnGap`
- Shape: `borderRadius`
- Depth: `boxShadow`

## Design System Structure

Default token structure:
- Colors: primary scale, secondary scale, neutrals, semantic colors
- Typography: Display, H1-H4, Body Large, Body, Body Small, Caption, Overline
- Spacing: 4px base scale
- Radii: sm, md, lg, xl, full
- Shadows: 4 elevation levels

Default component structure:
- Atoms: Button, Input, Badge, Avatar, Toggle
- Molecules: Form Field, Card, Nav Item, Search Bar
- Organisms: Navigation Bar, Hero, Feature Grid, Testimonials, CTA Section, Footer

## Figma Write Guidance

- Use auto-layout by default.
- After `set_layout_mode`, set child sizing explicitly with `set_child_layout_sizing`.
- Prefer styles plus `apply_style` over hardcoded values where possible.
- Use slash naming such as `Button/Primary/Default` and `Section/Hero`.
- Add component descriptions with `set_description`.
- Prefer variant naming like `Size=sm, State=default, Style=primary` before `create_component_set`.

## Design Constants

Type scale:
- Display: `72/80`, `-1.5`, `700`
- H1: `48/56`, `-1`, `700`
- H2: `36/44`, `-0.5`, `600`
- H3: `28/36`, `0`, `600`
- H4: `22/32`, `0`, `600`
- Body Large: `18/28`, `0`, `400`
- Body: `16/24`, `0`, `400`
- Body Small: `14/20`, `0`, `400`
- Caption: `12/16`, `0.4`, `400`
- Overline: `11/16`, `1.5`, `500`, uppercase

Spacing scale:
- `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`

Radii:
- `sm=4`, `md=8`, `lg=12`, `xl=16`, `2xl=24`, `full=9999`

Elevation:
- Level 1: `{ type: "DROP_SHADOW", radius: 3, color: {r:0,g:0,b:0,a:0.12}, offset: {x:0,y:1} }`
- Level 2: `{ type: "DROP_SHADOW", radius: 6, color: {r:0,g:0,b:0,a:0.10}, offset: {x:0,y:4} }`
- Level 3: `{ type: "DROP_SHADOW", radius: 15, color: {r:0,g:0,b:0,a:0.12}, offset: {x:0,y:10} }`
- Level 4: `{ type: "DROP_SHADOW", radius: 25, color: {r:0,g:0,b:0,a:0.15}, offset: {x:0,y:20} }`

## Page Patterns

Landing page:
- 1440px frame
- 80px vertical section rhythm
- Nav, hero, logo bar, features, process, testimonials, CTA, footer

Dashboard:
- 1440px frame
- Top bar, metrics row, charts row, data table
- Cards use md/lg radius and level 1 shadow

Settings page:
- Sidebar plus content split
- Content area uses 32-48px internal spacing

## Token Sync and Codegen

After writing or updating designs:
- Extract: `figma_extract_tokens`
- Export: `figma_export_tokens`
- Compare: `figma_diff_tokens`
- Map: `figma_map_components`
- Generate: `figma_generate_page`
- Audit: `figma_audit`
