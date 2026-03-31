#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FigmaRestClient } from "./shared/figma-rest.js";
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
  mapComponentsInputSchema,
  generatePageInputSchema,
  generateSchemaInputSchema,
  exportTokensInputSchema,
  findNodesInputSchema,
  getComponentsInputSchema,
  getStylesInputSchema,
  diffTokensInputSchema,
  executeInputSchema,
  pluginStatusInputSchema,
} from "./shared/types.js";

// ─── Inspect tools ───────────────────────────────────────────────────
import { handleGetTree, compactTree, truncateTree } from "./tools/inspect/get-tree.js";
import { handleAudit } from "./tools/inspect/audit.js";
import { handleExtractTokens } from "./tools/inspect/extract-tokens.js";
import { handleExportImages } from "./tools/inspect/export-images.js";
import { handleFindNodes } from "./tools/inspect/find-nodes.js";
import { handleGetComponents } from "./tools/inspect/get-components.js";
import { handleGetStyles } from "./tools/inspect/get-styles.js";
import { handleDiffTokens } from "./tools/inspect/diff-tokens.js";

// ─── Plan tools ──────────────────────────────────────────────────────
import { handlePlanNaming } from "./tools/organize/rename-plan.js";
import { handlePlanGrouping } from "./tools/organize/group-plan.js";
import { handlePlanLayout } from "./tools/organize/layout-plan.js";
import { handlePlanComponents } from "./tools/organize/component-plan.js";

// ─── Codegen tools ──────────────────────────────────────────────────
import { handleMapComponents } from "./tools/codegen/map-components.js";
import { handleGeneratePage } from "./tools/codegen/generate-page.js";
import { handleGenerateSchema } from "./tools/codegen/generate-schema.js";
import { handleExportTokens } from "./tools/codegen/export-tokens.js";

// ─── Plugin tools ───────────────────────────────────────────────────
import { BridgeServer } from "./plugin/bridge.js";
import { handleExecute } from "./tools/plugin/execute.js";
import { handlePluginStatus } from "./tools/plugin/status.js";

// ─── Configuration ──────────────────────────────────────────────────

const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY; // Optional — can be provided via figmaUrl

// Token is optional — all major CLIs (Claude Code, Codex, Gemini) support the official
// Figma MCP via OAuth. The token is only needed for this server's REST API analysis tools.
let rest: FigmaRestClient | null = null;
if (FIGMA_ACCESS_TOKEN) {
  rest = new FigmaRestClient(FIGMA_ACCESS_TOKEN, FIGMA_FILE_KEY);
}

const snapshotCache = new SnapshotCache();
const BRIDGE_PORT = Number(process.env.FIGMA_PLUGIN_PORT || 4010);
const bridge = new BridgeServer();

// Track the last root node for session continuity
let lastRootNodeId: string | undefined;

function getContext(): ToolContext {
  if (!rest) {
    throw new Error(
      "FIGMA_ACCESS_TOKEN is not set. Set it in your MCP config for REST API access, " +
      "or use the official Figma MCP (available in Claude Code, Codex, and Gemini) which handles auth via OAuth."
    );
  }
  return { rest, snapshotCache };
}

// ─── URL Resolution ─────────────────────────────────────────────────

/** Update session file key if a new Figma URL is provided. No nodeId required. */
function applyFileKey(params: { figmaUrl?: string }): void {
  if (!params.figmaUrl) return;
  const parsed = parseFigmaUrl(params.figmaUrl);
  if (rest && parsed.fileKey !== rest.defaultFileKey) {
    rest.defaultFileKey = parsed.fileKey;
    snapshotCache.invalidateAll();
    console.error(`[mcp] Switched to Figma file: ${parsed.fileKey}${parsed.fileName ? ` (${parsed.fileName})` : ""}`);
  }
}

/** Resolve figmaUrl + nodeId into a concrete nodeId. Throws if no nodeId can be determined. */
function resolveParams(params: { figmaUrl?: string; nodeId?: string }): { nodeId: string } {
  let nodeId = params.nodeId;

  if (params.figmaUrl) {
    applyFileKey(params);
    if (!nodeId) {
      const parsed = parseFigmaUrl(params.figmaUrl);
      if (parsed.nodeId) nodeId = parsed.nodeId;
    }
  }

  if (!nodeId) {
    nodeId = lastRootNodeId || "";
  }

  if (!nodeId) {
    throw new Error(
      "No node ID provided. Pass a Figma URL with ?node-id=X:Y or provide nodeId directly."
    );
  }

  return { nodeId };
}

function jsonResponse(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

// ─── MCP Resources (workflow guides) ────────────────────────────────

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

const TOKEN_GUIDE = `# Figma Token Sync Guide

Use this path only for design-token work.

## Read Paths
- figma_extract_tokens: read tokens from the REST API view of the file
- figma_get_styles: read published styles via REST API

## Sync Paths
1. Use the official Figma MCP's use_figma to call figma.getLocalPaintStyles() / getLocalTextStyles() / getLocalEffectStyles()
2. Pass the result to figma_diff_tokens along with your code tokens
3. Use use_figma to create/update styles as needed

Alternative (REST API):
1. figma_get_styles to read published styles (requires FIGMA_ACCESS_TOKEN)
2. figma_diff_tokens to compare
3. Apply changes via the official Figma MCP's use_figma

## Export Paths
- figma_export_tokens with format "tailwind", "css", or "json"
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

const ACTION_REFERENCE = `# figma_execute Action Reference — 43 Action Types

Use with figma_execute({ actions: [...] }) for batch execution via the plugin bridge.

## Scene Graph
- rename: { nodeId, name }
- move: { nodeId, targetParentId, insertIndex? }
- create_frame: { name, parentId, x?, y?, width?, height? } → returns newNodeId
- delete_node: { nodeId, confirmed: true }
- resize: { nodeId, width?, height? }
- set_position: { nodeId, x?, y? }
- duplicate_node: { nodeId } → returns newNodeId
- set_visible: { nodeId, visible }
- set_opacity: { nodeId, opacity: 0-1 }

## Layout
- set_layout_mode: { nodeId, mode: "HORIZONTAL"|"VERTICAL"|"NONE" }
- set_layout_positioning: { nodeId, positioning: "AUTO"|"ABSOLUTE" }
- set_alignment: { nodeId, primaryAxisAlignItems?, counterAxisAlignItems? }
- set_spacing: { nodeId, itemSpacing?, paddingTop/Right/Bottom/Left? }
- **set_child_layout_sizing: { nodeId, layoutSizingHorizontal?: "FILL"|"HUG"|"FIXED", layoutSizingVertical? }** — responsive stretching
- **set_constraints: { nodeId, horizontal?: "MIN"|"CENTER"|"MAX"|"STRETCH"|"SCALE", vertical? }** — responsive pinning
- **set_min_max_size: { nodeId, minWidth?, maxWidth?, minHeight?, maxHeight? }** — responsive boundaries

## Appearance
- set_fills: { nodeId, fills: [{ type: "SOLID", color: {r,g,b,a} }] }
- **set_gradient_fill: { nodeId, gradientType: "LINEAR"|"RADIAL"|"ANGULAR", stops: [{position, color}], angle? }**
- **set_image_fill: { nodeId, imageBase64, scaleMode: "FILL"|"FIT"|"CROP"|"TILE" }**
- set_strokes: { nodeId, strokes, strokeWeight? }
- set_effects: { nodeId, effects }
- set_corner_radius: { nodeId, radius? | radii?: [tl,tr,br,bl] }

## Text
- create_text: { parentId, characters, name?, fontFamily?, fontWeight?, fontSize?, lineHeight?, letterSpacing?, fills?, textCase?, textAlignHorizontal?, textAutoResize?, layoutSizingHorizontal?, layoutSizingVertical?, opacity? } → returns newNodeId
- set_text_content: { nodeId, characters }
- set_text_style: { nodeId, fontFamily?, fontSize?, fontWeight?, lineHeight?, letterSpacing? }
- **set_text_properties: { nodeId, textAlignHorizontal?, textAlignVertical?, paragraphSpacing?, textCase?, textDecoration?, textAutoResize? }**

## Components
- create_component_from_node: { nodeId, name } → returns newNodeId
- create_component_set: { componentIds[], name } → returns newNodeId
- create_instance: { componentId, parentId, x?, y? } → returns newNodeId
- swap_instance: { instanceId, newComponentId }
- set_component_properties: { nodeId, properties: { "Prop": value } }
- **define_component_property: { nodeId, propertyName, propertyType: "TEXT"|"BOOLEAN"|"INSTANCE_SWAP"|"VARIANT", defaultValue }**

## Styles
- create_paint_style: { name, paints } → returns newNodeId
- create_text_style: { name, fontFamily, fontSize, ... } → returns newNodeId
- create_effect_style: { name, effects } → returns newNodeId
- **apply_style: { nodeId, styleId, property: "fill"|"stroke"|"text"|"effect" }** — bind style to node
- **set_description: { nodeId, description }** — component documentation

## Pages
- **create_page: { name }** → returns newNodeId
- **switch_page: { pageId }** — navigate before creating on a specific page

## Variables (Design Tokens)
- **create_variable_collection: { name, modes: ["Light", "Dark"] }** → returns newNodeId
- **create_variable: { collectionId, name, resolvedType: "COLOR"|"FLOAT"|"STRING"|"BOOLEAN", value, scopes? }** → returns newNodeId
- **bind_variable: { nodeId, property: "fills"|"paddingLeft"|..., variableId, paintIndex? }** — bind token to node

## Export
- export_node: { nodeId, format?, scale? }

**Bold** = added in this release. Use $ref:node-N for chaining created node IDs within a batch.
`;

// ─── MCP Server ─────────────────────────────────────────────────────

const server = new McpServer({
  name: "figma-design-pipeline",
  version: "0.7.3",
});

// ─── MCP Resources ──────────────────────────────────────────────────

server.resource(
  "action-reference",
  "figma://actions",
  { mimeType: "text/markdown", description: "Schema reference for all 43 figma_execute action types. Use with figma_execute({ actions: [...] }) for batch execution." },
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
  "tokens-guide",
  "figma://tokens",
  { mimeType: "text/markdown", description: "Token extraction, diff, export, and sync workflow." },
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

// ─── Inspect tools (read-only, via REST API) ────────────────────────

server.tool(
  "figma_get_tree",
  "Fetch enriched Figma node tree with classifications, tokens, and layout info. Pass a Figma URL or nodeId.",
  getTreeInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const ctx = getContext();
    const result = await handleGetTree(ctx, { ...params, nodeId });

    // Track for session continuity
    lastRootNodeId = nodeId;

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
    return jsonResponse(result);
  }
);

server.tool(
  "figma_extract_tokens",
  "Extract design tokens (colors, fonts, spacing, radius, shadows) with Tailwind class mapping",
  extractTokensInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleExtractTokens(getContext(), { ...params, nodeId: nodeId! });
    return jsonResponse(result);
  }
);

server.tool(
  "figma_export_images",
  "Export node renders as images via REST API. Returns temporary Figma-hosted URLs.",
  exportImagesInputSchema.shape,
  async (params) => {
    applyFileKey(params);
    const result = await handleExportImages(getContext(), params);
    return jsonResponse(result);
  }
);

server.tool(
  "figma_find_nodes",
  "Search/filter nodes by name pattern, type, classification, text content, or size. Returns matching nodes without full tree output.",
  findNodesInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleFindNodes(getContext(), { ...params, nodeId });
    return jsonResponse(result);
  }
);

server.tool(
  "figma_get_components",
  "List all components in a Figma file with names, descriptions, and node IDs. Uses REST API.",
  getComponentsInputSchema.shape,
  async (params) => {
    applyFileKey(params);
    const result = await handleGetComponents(getContext());
    return jsonResponse(result);
  }
);

server.tool(
  "figma_get_styles",
  "List all published styles (colors, text, effects, grids) in a Figma file. Uses REST API.",
  getStylesInputSchema.shape,
  async (params) => {
    applyFileKey(params);
    const result = await handleGetStyles(getContext());
    return jsonResponse(result);
  }
);

server.tool(
  "figma_diff_tokens",
  "Compare Figma styles vs provided tokens. Provide figmaStyles data (from official Figma MCP's use_figma or REST API). Reports drift: figmaOnly, codeOnly, changed, matched. No FIGMA_ACCESS_TOKEN needed.",
  diffTokensInputSchema.shape,
  async (params) => {
    applyFileKey(params);
    const result = handleDiffTokens(params);
    return jsonResponse(result);
  }
);

// ─── Plan tools ─────────────────────────────────────────────────────

server.tool(
  "figma_plan_naming",
  "Generate semantic rename plan for generic-named nodes. Returns actions array for use with the official Figma MCP's use_figma tool.",
  planNamingInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handlePlanNaming(getContext(), { ...params, nodeId });
    return jsonResponse(result);
  }
);

server.tool(
  "figma_plan_grouping",
  "Plan semantic frame grouping for scattered elements. Returns actions array for use with the official Figma MCP's use_figma tool.",
  planGroupingInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handlePlanGrouping(getContext(), { ...params, nodeId });
    return jsonResponse(result);
  }
);

server.tool(
  "figma_plan_layout",
  "Plan auto-layout conversion from absolute positioning. Returns actions array for use with the official Figma MCP's use_figma tool.",
  planLayoutInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handlePlanLayout(getContext(), { ...params, nodeId });
    return jsonResponse(result);
  }
);

server.tool(
  "figma_plan_components",
  "Plan component extraction from repeated visual patterns. Returns actions array for use with the official Figma MCP's use_figma tool.",
  planComponentsInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handlePlanComponents(getContext(), { ...params, nodeId });
    return jsonResponse(result);
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
    return jsonResponse(result);
  }
);

server.tool(
  "figma_generate_page",
  "Generate an Astro page template from organized Figma design",
  generatePageInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleGeneratePage(getContext(), { ...params, nodeId });
    return jsonResponse(result);
  }
);

server.tool(
  "figma_generate_schema",
  "Generate a CMS ContentSchema definition from Figma design structure",
  generateSchemaInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleGenerateSchema(getContext(), { ...params, nodeId });
    return jsonResponse(result);
  }
);

server.tool(
  "figma_export_tokens",
  "Export extracted design tokens as Tailwind config, CSS variables, or JSON",
  exportTokensInputSchema.shape,
  async (params) => {
    const { nodeId } = resolveParams(params);
    const result = await handleExportTokens(getContext(), { ...params, nodeId });
    return jsonResponse(result);
  }
);

// ─── Plugin tools (high-performance batch execution) ────────────────

server.tool(
  "figma_execute",
  "PREFERRED TOOL for ALL Figma write operations. Execute a batch of validated actions via plugin bridge — 30-60x faster than use_figma. Do NOT use use_figma for writes; use this tool instead. Supports 43 action types including text creation, layout, variables, pages, gradients, images, and text properties. If plugin not connected, returns fallback JavaScript for use_figma. Call figma_plugin_status to check connection.",
  executeInputSchema.shape,
  async (params) => {
    const result = await handleExecute(bridge, {
      actions: params.actions,
      dryRun: params.dryRun,
      stopOnError: params.stopOnError,
      rollbackOnError: params.rollbackOnError,
      timeoutMs: params.timeoutMs,
    });
    if (result.pluginConnected) {
      snapshotCache.invalidateAll();
    }
    return jsonResponse(result);
  }
);

server.tool(
  "figma_plugin_status",
  "Check if the Figma plugin is connected. Returns connection status, plugin version, current page, and pending batches.",
  pluginStatusInputSchema.shape,
  async () => {
    return jsonResponse(handlePluginStatus(bridge));
  }
);

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  // Start the plugin bridge (non-fatal if port is busy)
  try {
    const port = await bridge.start(BRIDGE_PORT);
    console.error(`[mcp] Plugin bridge listening on ws://127.0.0.1:${port}/plugin`);
  } catch (err) {
    console.error(`[mcp] Plugin bridge failed to start: ${err instanceof Error ? err.message : err}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[mcp] Figma Design Pipeline MCP server running (stdio)");
  if (FIGMA_ACCESS_TOKEN) {
    if (FIGMA_FILE_KEY) {
      console.error(`[mcp] Default file key: ${FIGMA_FILE_KEY}`);
    } else {
      console.error("[mcp] No default file key — pass a Figma URL with any tool call");
    }
  } else {
    console.error("[mcp] No FIGMA_ACCESS_TOKEN — REST API tools require a token. All major CLIs support the official Figma MCP for OAuth-based access.");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
