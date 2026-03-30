#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BridgeServer } from "./bridge/bridge-server.js";
import { FigmaRestClient } from "./bridge/figma-rest.js";
import { PipelineStateManager } from "./pipeline/state.js";
import { SnapshotCache } from "./pipeline/snapshot.js";
import { parseFigmaUrl } from "./shared/figma-url.js";
import type { ToolContext } from "./shared/context.js";
import {
  getTreeInputSchema,
  auditInputSchema,
  extractTokensInputSchema,
  exportImagesInputSchema,
  planNamingInputSchema,
  planGroupingInputSchema,
  planLayoutInputSchema,
  planComponentsInputSchema,
  applyBatchInputSchema,
  verifyInputSchema,
  rollbackInputSchema,
  mapComponentsInputSchema,
  generatePageInputSchema,
  generateSchemaInputSchema,
  exportTokensInputSchema,
  findNodesInputSchema,
  getComponentsInputSchema,
  getStylesInputSchema,
  getLocalStylesInputSchema,
  pushTokensInputSchema,
  diffTokensInputSchema,
} from "./shared/types.js";

// ─── Inspect tools ───────────────────────────────────────────────────
import { handleGetTree, compactTree, truncateTree } from "./tools/inspect/get-tree.js";
import { handleAudit } from "./tools/inspect/audit.js";
import { handleExtractTokens } from "./tools/inspect/extract-tokens.js";
import { handleExportImages } from "./tools/inspect/export-images.js";
import { handleFindNodes } from "./tools/inspect/find-nodes.js";
import { handleGetComponents } from "./tools/inspect/get-components.js";
import { handleGetStyles } from "./tools/inspect/get-styles.js";
import { handleGetLocalStyles } from "./tools/inspect/get-local-styles.js";
import { handleDiffTokens } from "./tools/inspect/diff-tokens.js";

// ─── Plan tools ──────────────────────────────────────────────────────
import { handlePlanNaming } from "./tools/organize/rename-plan.js";
import { handlePlanGrouping } from "./tools/organize/group-plan.js";
import { handlePlanLayout } from "./tools/organize/layout-plan.js";
import { handlePlanComponents } from "./tools/organize/component-plan.js";

// ─── Mutate tools ────────────────────────────────────────────────────
import { handleApplyBatch } from "./tools/mutate/apply-batch.js";
import { handleVerify } from "./tools/mutate/verify.js";
import { handleRollback } from "./tools/mutate/rollback.js";
import { handlePushTokens } from "./tools/mutate/push-tokens.js";

// ─── Codegen tools ──────────────────────────────────────────────────
import { handleMapComponents } from "./tools/codegen/map-components.js";
import { handleGeneratePage } from "./tools/codegen/generate-page.js";
import { handleGenerateSchema } from "./tools/codegen/generate-schema.js";
import { handleExportTokens } from "./tools/codegen/export-tokens.js";

// ─── Configuration ──────────────────────────────────────────────────

const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY; // Optional — can be provided via figmaUrl
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 4010);

if (!FIGMA_ACCESS_TOKEN) {
  console.error("Missing FIGMA_ACCESS_TOKEN environment variable");
  process.exit(1);
}

// ─── Shared context ─────────────────────────────────────────────────

const rest = new FigmaRestClient(FIGMA_ACCESS_TOKEN, FIGMA_FILE_KEY);
const bridge = new BridgeServer({ port: BRIDGE_PORT });
const snapshotCache = new SnapshotCache();

// State manager uses file key — will be created/swapped dynamically
let stateManager = new PipelineStateManager(FIGMA_FILE_KEY || "default");

function getContext(): ToolContext {
  return { rest, hub: bridge.hub, stateManager, snapshotCache };
}

// ─── URL Resolution ─────────────────────────────────────────────────

/**
 * Resolve figmaUrl + nodeId params into concrete values.
 * Updates the session's default file key when a new URL is provided.
 */
function resolveParams(params: { figmaUrl?: string; nodeId?: string }): {
  nodeId: string;
  fileKeyChanged: boolean;
} {
  let nodeId = params.nodeId;
  let fileKeyChanged = false;

  if (params.figmaUrl) {
    const parsed = parseFigmaUrl(params.figmaUrl);

    // Update default file key for this session
    if (parsed.fileKey !== rest.defaultFileKey) {
      rest.defaultFileKey = parsed.fileKey;
      stateManager = new PipelineStateManager(parsed.fileKey);
      snapshotCache.invalidateAll();
      fileKeyChanged = true;
      console.error(`[mcp] Switched to Figma file: ${parsed.fileKey}${parsed.fileName ? ` (${parsed.fileName})` : ""}`);
    }

    // Use node ID from URL if not explicitly provided
    if (!nodeId && parsed.nodeId) {
      nodeId = parsed.nodeId;
    }
  }

  if (!nodeId) {
    // Try to use the last known root node
    nodeId = stateManager.current.rootNodeId || "";
  }

  if (!nodeId) {
    throw new Error(
      "No node ID provided. Pass a Figma URL with ?node-id=X:Y or provide nodeId directly."
    );
  }

  return { nodeId, fileKeyChanged };
}

// ─── Action Reference (loaded on-demand via MCP Resource) ───────────

const ACTION_REFERENCE = `# Figma Mutation Action Reference

All actions use strict Zod schemas — unknown keys cause validation errors.
Pass actions via figma_apply_batch({ actions: [...], dryRun: false }).

## Layout & Structure
- rename: { type, nodeId, name }
- move: { type, nodeId, targetParentId, insertIndex? } — insertIndex is 0-based (0=back, omit=front). NOTE: param is "insertIndex" NOT "index".
- create_frame: { type, name, parentId, x?, y?, width?, height? }
- delete_node: { type, nodeId, confirmed: true }
- resize: { type, nodeId, width?, height? }
- set_position: { type, nodeId, x?, y? }
- duplicate_node: { type, nodeId } — clones a node, returns { newNodeId, name }

## Auto-Layout
- set_layout_mode: { type, nodeId, mode: "HORIZONTAL"|"VERTICAL"|"NONE", primaryAxisSizingMode?: "FIXED"|"AUTO", counterAxisSizingMode?: "FIXED"|"AUTO" }
- set_layout_positioning: { type, nodeId, positioning: "AUTO"|"ABSOLUTE" } — child's position in auto-layout parent
- set_alignment: { type, nodeId, primaryAxisAlignItems?: "MIN"|"CENTER"|"MAX"|"SPACE_BETWEEN", counterAxisAlignItems?: "MIN"|"CENTER"|"MAX"|"BASELINE" }
- set_spacing: { type, nodeId, itemSpacing?, paddingTop?, paddingRight?, paddingBottom?, paddingLeft? }

## Appearance
- set_fills: { type, nodeId, fills: [{ type: "SOLID"|"GRADIENT_LINEAR"|"IMAGE", color?: {r,g,b,a}, opacity? }] }
- set_strokes: { type, nodeId, strokes: [{ type: "SOLID", color: {r,g,b,a} }], strokeWeight? }
- set_effects: { type, nodeId, effects: [{ type: "DROP_SHADOW"|"INNER_SHADOW"|"LAYER_BLUR"|"BACKGROUND_BLUR", visible?, radius?, color?: {r,g,b,a}, offset?: {x,y}, spread? }] }
- set_corner_radius: { type, nodeId, radius? (uniform), radii? [tl,tr,br,bl] }
- set_visible: { type, nodeId, visible: boolean }
- set_opacity: { type, nodeId, opacity: 0-1 }

## Text
- set_text_content: { type, nodeId, characters }
- set_text_style: { type, nodeId, fontFamily?, fontSize?, fontWeight?, lineHeight?, letterSpacing? }

## Components & Variants
- create_component_from_node: { type, nodeId, name }
- create_component_set: { type, componentIds[], name } — combine components into a variant set
- create_instance: { type, componentId, parentId, x?, y? }
- swap_instance: { type, instanceId, newComponentId }
- set_component_properties: { type, nodeId, properties: { "PropName": "value" | true/false } } — set variant/text/boolean props on an instance

### Variant Creation Workflow
1. Create a button frame: create_frame + set_fills + set_text_content + resize + set_corner_radius
2. Convert to component: create_component_from_node
3. Duplicate for each variant: duplicate_node (repeat for secondary, ghost, etc.)
4. Style each variant: set_fills, set_strokes, set_text_style, set_opacity, etc.
5. Name with variant syntax: rename to "Style=Primary", "Style=Secondary", etc.
6. Combine into set: create_component_set
7. Use: create_instance + set_component_properties to switch variants

## Styles
- get_local_styles: { type, styleTypes?: ["PAINT","TEXT","EFFECT"] } — read all local styles with full values
- create_paint_style: { type, name, paints: [{ type: "SOLID", color: {r,g,b,a} }] } — create a color style (use "/" for folders)
- create_text_style: { type, name, fontFamily, fontWeight?, fontSize, lineHeight?, letterSpacing? } — create a text style (loads font automatically)
- create_effect_style: { type, name, effects: [{ type, radius?, color?, offset?, spread? }] } — create an effect style

## Export
- export_node: { type, nodeId, format?: "PNG"|"SVG"|"PDF"|"JPG", scale?: 0.5-4 } — returns base64 data
`;

const INSPECT_GUIDE = `# Figma Inspect Guide

Use this path when the goal is understanding a design, not modifying it.

## Start Small
- Prefer figma_get_tree on a focused node or page frame instead of the whole file.
- Use figma_find_nodes when you already know roughly what you are looking for.
- Use figma_audit when you want a bounded list of structural problems.

## Recommended Order
1. figma_get_tree
2. figma_audit
3. figma_extract_tokens
4. figma_export_images if you need visual snapshots

## Context Rules
- figma_get_tree is compact by default and auto-truncates at 80KB.
- figma_extract_tokens is the detailed style view. Do not request it unless token detail is actually needed.
- For very large files, keep drilling into specific nodeIds instead of repeating root fetches.
`;

const MUTATE_GUIDE = `# Figma Mutate Guide

Read this before any write operation.

## Safe Lifecycle
1. figma_audit
2. plan tool
3. figma_apply_batch with dryRun: true
4. figma_apply_batch with dryRun: false
5. figma_verify
6. figma_rollback if needed

## Required Resources
- Read figma://actions before creating or editing action payloads.

## Gotchas
- move uses insertIndex, not index.
- Most instance edits must happen on the main component.
- Mutations require the Figma plugin to be running and connected.
- Delete actions require explicit confirmed: true.
`;

const TOKEN_GUIDE = `# Figma Token Sync Guide

Use this path only for design-token work.

## Read Paths
- figma_extract_tokens: read tokens from the REST API view of the file
- figma_get_local_styles: read local styles from the plugin for richer values

## Sync Paths
1. figma_get_local_styles
2. figma_diff_tokens
3. figma_push_tokens only after drift review

## Export Paths
- figma_export_tokens with format "tailwind", "css", or "json"

## Guardrails
- Treat push as a write path: review before applying.
- Prefer diff first when code and Figma may have diverged.
`;

const CODEGEN_GUIDE = `# Figma Codegen Guide

Use this path when turning organized Figma structure into code or schema output.

## Recommended Order
1. figma_get_tree
2. figma_map_components
3. figma_generate_page
4. figma_generate_schema

## Registry
- The component registry lives in the target project, not this package.
- Set COMPONENT_REGISTRY_DIR when using map-components or schema/page generation against a project registry.

## Scope
- figma_map_components currently maps the root node and direct significant children.
- Keep generation scoped to a focused page or section node for cleaner output.
`;

// ─── MCP Server ─────────────────────────────────────────────────────

const server = new McpServer({
  name: "figma-design-pipeline",
  version: "0.5.0",
});

// ─── MCP Resource: Action Reference (on-demand) ────────────────────
// LLMs read this only when they need to write mutations.

server.resource(
  "action-reference",
  "figma://actions",
  { mimeType: "text/markdown", description: "Full schema reference for all 29 action types (25 mutation + 4 style). Read this before using figma_apply_batch." },
  async () => ({
    contents: [{ uri: "figma://actions", mimeType: "text/markdown", text: ACTION_REFERENCE }],
  })
);

server.resource(
  "inspect-guide",
  "figma://inspect",
  { mimeType: "text/markdown", description: "Minimal workflow for read-only structure inspection without overloading context." },
  async () => ({
    contents: [{ uri: "figma://inspect", mimeType: "text/markdown", text: INSPECT_GUIDE }],
  })
);

server.resource(
  "mutate-guide",
  "figma://mutate",
  { mimeType: "text/markdown", description: "Mutation lifecycle, safety steps, and pre-write gotchas. Read before applying changes." },
  async () => ({
    contents: [{ uri: "figma://mutate", mimeType: "text/markdown", text: MUTATE_GUIDE }],
  })
);

server.resource(
  "tokens-guide",
  "figma://tokens",
  { mimeType: "text/markdown", description: "Token extraction, diff, export, and push workflow." },
  async () => ({
    contents: [{ uri: "figma://tokens", mimeType: "text/markdown", text: TOKEN_GUIDE }],
  })
);

server.resource(
  "codegen-guide",
  "figma://codegen",
  { mimeType: "text/markdown", description: "Component mapping and codegen workflow, including registry usage." },
  async () => ({
    contents: [{ uri: "figma://codegen", mimeType: "text/markdown", text: CODEGEN_GUIDE }],
  })
);

// ─── Inspect tools (read-only, most commonly used) ──────────────────

server.tool(
  "figma_get_tree",
  "Fetch enriched Figma node tree with classifications, tokens, and layout info. Pass a Figma URL or nodeId.",
  getTreeInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleGetTree(getContext(), { ...params, nodeId });

    // Return compact tree by default — strips tokens, componentProperties,
    // variantProperties, and collapses vector leaves. Use figma_extract_tokens
    // for detailed token data, or figma_find_nodes to search specific nodes.
    const compact = compactTree(result.tree);
    const { tree: outputTree, truncated, nodeCount } = truncateTree(compact, 80_000);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          nodeId: result.nodeId,
          fromCache: result.fromCache,
          nodeCount,
          ...(truncated ? { truncated: true, note: "Tree exceeded 80KB — deeper children omitted. Use figma_get_tree on specific nodeIds to drill down." } : {}),
          tree: outputTree,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  "figma_audit",
  "Structural audit: naming, layout, components, tokens, accessibility checks.",
  auditInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleAudit(getContext(), { ...params, nodeId, maxViolations: params.maxViolations });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_extract_tokens",
  "Extract design tokens (colors, fonts, spacing, radius, shadows) with Tailwind class mapping",
  extractTokensInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleExtractTokens(getContext(), { ...params, nodeId: nodeId! });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_export_images",
  "Export node renders as images via REST API (no plugin needed). Returns temporary Figma-hosted URLs.",
  exportImagesInputSchema.shape,
  async (params) => {
    if (params.figmaUrl) {
      resolveParams(params); // update session file key
    }
    const result = await handleExportImages(getContext(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_find_nodes",
  "Search/filter nodes by name pattern, type, classification, text content, or size. Returns matching nodes without full tree output.",
  findNodesInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleFindNodes(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_get_components",
  "List all components in a Figma file with names, descriptions, and node IDs. Uses REST API.",
  getComponentsInputSchema.shape,
  async (params) => {
    if (params.figmaUrl) {
      resolveParams(params);
    }
    const result = await handleGetComponents(getContext());
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_get_styles",
  "List all published styles (colors, text, effects, grids) in a Figma file. Uses REST API.",
  getStylesInputSchema.shape,
  async (params) => {
    if (params.figmaUrl) {
      resolveParams(params);
    }
    const result = await handleGetStyles(getContext());
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Style sync tools ───────────────────────────────────────────────

server.tool(
  "figma_get_local_styles",
  "Read all local paint/text/effect styles with full values (colors, fonts, shadows). Richer than REST API. Requires plugin.",
  getLocalStylesInputSchema.shape,
  async (params) => {
    if (params.figmaUrl) {
      resolveParams(params);
    }
    const result = await handleGetLocalStyles(getContext(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_push_tokens",
  "Create Figma styles from token definitions (colors as hex, fonts, effects). Handles conflicts via skip or rename.",
  pushTokensInputSchema.shape,
  async (params) => {
    if (params.figmaUrl) {
      resolveParams(params);
    }
    const result = await handlePushTokens(getContext(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_diff_tokens",
  "Compare Figma local styles vs provided tokens. Reports drift: figmaOnly, codeOnly, changed, matched.",
  diffTokensInputSchema.shape,
  async (params) => {
    if (params.figmaUrl) {
      resolveParams(params);
    }
    const result = await handleDiffTokens(getContext(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Plan tools ─────────────────────────────────────────────────────

server.tool(
  "figma_plan_naming",
  "Generate semantic rename plan for generic-named nodes",
  planNamingInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handlePlanNaming(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_plan_grouping",
  "Plan semantic frame grouping for scattered elements",
  planGroupingInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handlePlanGrouping(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_plan_layout",
  "Plan auto-layout conversion from absolute positioning",
  planLayoutInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handlePlanLayout(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_plan_components",
  "Plan component extraction from repeated visual patterns",
  planComponentsInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handlePlanComponents(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Mutate tools ───────────────────────────────────────────────────

server.tool(
  "figma_apply_batch",
  "Execute a batch of actions via the Figma plugin (dry-run by default). Supports 29 action types including rename, resize, move, duplicate_node, set_fills, set_component_properties, create_paint_style, and more. Read the figma://actions resource for full schema reference. All schemas are strict — unknown keys cause validation errors.",
  applyBatchInputSchema.shape,
  async (params) => {
    const result = await handleApplyBatch(getContext(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_verify",
  "Verify Figma state matches expected state after mutations",
  verifyInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleVerify(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_rollback",
  "Undo the last batch of mutations by applying inverse actions",
  rollbackInputSchema.shape,
  async (params) => {
    const result = await handleRollback(getContext(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Codegen tools ──────────────────────────────────────────────────

server.tool(
  "figma_map_components",
  "Map Figma nodes to codebase components using signature matching and hints",
  mapComponentsInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleMapComponents(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_generate_page",
  "Generate an Astro page template from organized Figma design",
  generatePageInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleGeneratePage(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_generate_schema",
  "Generate a CMS ContentSchema definition from Figma design structure",
  generateSchemaInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleGenerateSchema(getContext(), { ...params, nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "figma_export_tokens",
  "Export extracted design tokens as Tailwind config, CSS variables, or JSON",
  exportTokensInputSchema.shape,
  async (params) => {
    const result = await handleExportTokens(getContext(), params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  // Load persisted state (if file key known)
  if (FIGMA_FILE_KEY) {
    await stateManager.load();
  }

  // Start the bridge server (plugin WebSocket endpoint)
  await bridge.start();

  // Connect MCP via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[mcp] Figma Design Pipeline MCP server running (stdio)");
  console.error(`[mcp] Bridge at http://127.0.0.1:${BRIDGE_PORT}`);
  console.error(`[mcp] Plugin WS at ws://127.0.0.1:${BRIDGE_PORT}/plugin`);
  if (FIGMA_FILE_KEY) {
    console.error(`[mcp] Default file key: ${FIGMA_FILE_KEY}`);
  } else {
    console.error("[mcp] No default file key — pass a Figma URL with any tool call");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
