import type { ToolContext } from "../../shared/context.js";
import type { EnrichedNode, FigmaRawNode } from "../../shared/types.js";
import { classifyNode } from "../../analysis/node-classifier.js";
import { extractNodeTokens } from "../../analysis/token-extractor.js";

interface GetTreeParams {
  nodeId: string;
  depth?: number;
  includeStyles?: boolean;
}

/**
 * Compact node — stripped version for LLM consumption.
 * Removes tokens, componentProperties, variantProperties, and
 * collapses leaf vector/shape nodes to reduce context size.
 */
interface CompactNode {
  id: string;
  name: string;
  type: string;
  classification: string;
  depth: number;
  childCount: number;
  bounds?: { x: number; y: number; width: number; height: number };
  layoutInfo?: EnrichedNode["layoutInfo"];
  textContent?: string;
  isComponent: boolean;
  isInstance: boolean;
  componentId?: string;
  children: CompactNode[];
}

const MAX_RESPONSE_BYTES = 80_000; // ~80KB — keep well within LLM context budget

export async function handleGetTree(
  ctx: ToolContext,
  params: GetTreeParams
): Promise<{ nodeId: string; tree: EnrichedNode; fromCache: boolean }> {
  const { nodeId, depth = 10, includeStyles = true } = params;

  // Check cache first
  const cached = ctx.snapshotCache.get(nodeId);
  if (cached) {
    return { nodeId, tree: cached, fromCache: true };
  }

  // Fetch from REST API
  const data = (await ctx.rest.getFileNodes([nodeId], { depth })) as {
    nodes: Record<string, { document: FigmaRawNode }>;
  };

  const rawRoot = data?.nodes?.[nodeId]?.document;
  if (!rawRoot) {
    throw new Error(`Node ${nodeId} not found in Figma file`);
  }

  // Enrich the tree
  const enriched = enrichNode(rawRoot, 0, includeStyles);

  // Cache the result
  ctx.snapshotCache.set(nodeId, enriched);
  ctx.stateManager.setRootNode(nodeId);

  return { nodeId, tree: enriched, fromCache: false };
}

/**
 * Produce a compact tree for LLM consumption.
 * Strips tokens, componentProperties, variantProperties, originalName.
 * Collapses leaf vector/shape nodes (VECTOR, ELLIPSE, LINE, STAR, etc.)
 * into a single summary when there are many siblings.
 */
export function compactTree(node: EnrichedNode): CompactNode {
  // Collapse vector-heavy children (e.g., icon SVG paths)
  let children: CompactNode[];
  const vectorTypes = new Set(["VECTOR", "BOOLEAN_OPERATION", "LINE", "ELLIPSE", "STAR", "RECTANGLE"]);
  const vectorChildren = node.children.filter(c => vectorTypes.has(c.type) && c.childCount === 0);
  const otherChildren = node.children.filter(c => !(vectorTypes.has(c.type) && c.childCount === 0));

  if (vectorChildren.length > 3) {
    // Collapse many vector leaves into one placeholder
    children = otherChildren.map(c => compactTree(c));
    children.push({
      id: `${node.id}:vectors`,
      name: `[${vectorChildren.length} vector shapes]`,
      type: "COLLAPSED",
      classification: "unknown",
      depth: node.depth + 1,
      childCount: 0,
      isComponent: false,
      isInstance: false,
      children: [],
    });
  } else {
    children = node.children.map(c => compactTree(c));
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    classification: node.classification,
    depth: node.depth,
    childCount: node.childCount,
    bounds: node.bounds,
    layoutInfo: node.layoutInfo,
    textContent: node.textContent,
    isComponent: node.isComponent,
    isInstance: node.isInstance,
    componentId: node.componentId,
    children,
  };
}

/**
 * Truncate tree to fit within byte budget.
 * Progressively removes deeper children until under limit.
 */
export function truncateTree(node: CompactNode, maxBytes: number): { tree: CompactNode; truncated: boolean; nodeCount: number } {
  let result = structuredClone(node);
  let json = JSON.stringify(result);
  let truncated = false;

  // Progressively reduce max depth until we fit
  for (let maxDepth = 8; json.length > maxBytes && maxDepth >= 1; maxDepth--) {
    result = pruneAtDepth(structuredClone(node), maxDepth);
    json = JSON.stringify(result);
    truncated = true;
  }

  return { tree: result, truncated, nodeCount: countNodes(result) };
}

function pruneAtDepth(node: CompactNode, maxDepth: number, currentDepth = 0): CompactNode {
  if (currentDepth >= maxDepth && node.children.length > 0) {
    return {
      ...node,
      children: [{
        id: `${node.id}:truncated`,
        name: `[${node.childCount} children omitted — use figma_get_tree with this nodeId for details]`,
        type: "TRUNCATED",
        classification: "unknown",
        depth: currentDepth + 1,
        childCount: 0,
        isComponent: false,
        isInstance: false,
        children: [],
      }],
    };
  }
  return {
    ...node,
    children: node.children.map(c => pruneAtDepth(c, maxDepth, currentDepth + 1)),
  };
}

function countNodes(node: CompactNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

function enrichNode(
  raw: FigmaRawNode,
  depth: number,
  includeStyles: boolean,
  parentBounds?: { width: number; height: number },
  siblingIndex?: number,
  totalSiblings?: number
): EnrichedNode {
  const classification = classifyNode(raw, parentBounds, siblingIndex, totalSiblings);
  const tokens = includeStyles ? extractNodeTokens(raw) : [];

  const bounds = raw.absoluteBoundingBox;
  const children = (raw.children || []).map((child, i) =>
    enrichNode(
      child,
      depth + 1,
      includeStyles,
      bounds ? { width: bounds.width, height: bounds.height } : undefined,
      i,
      raw.children?.length
    )
  );

  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    originalName: raw.name,
    classification,
    depth,
    childCount: children.length,
    bounds,
    tokens,
    layoutInfo: raw.layoutMode
      ? {
          mode:
            raw.layoutMode === "HORIZONTAL"
              ? "horizontal"
              : raw.layoutMode === "VERTICAL"
                ? "vertical"
                : "none",
          spacing: raw.itemSpacing,
          padding:
            raw.paddingTop !== undefined
              ? {
                  top: raw.paddingTop || 0,
                  right: raw.paddingRight || 0,
                  bottom: raw.paddingBottom || 0,
                  left: raw.paddingLeft || 0,
                }
              : undefined,
        }
      : bounds
        ? { mode: "absolute" }
        : undefined,
    textContent: raw.characters,
    isComponent: raw.type === "COMPONENT" || raw.type === "COMPONENT_SET",
    isInstance: raw.type === "INSTANCE",
    componentId: raw.componentId,
    ...(raw.componentProperties ? { componentProperties: raw.componentProperties } : {}),
    ...(raw.componentPropertyDefinitions ? {
      variantProperties: Object.fromEntries(
        Object.entries(raw.componentPropertyDefinitions).map(([k, v]) => [
          k,
          { type: v.type, defaultValue: v.defaultValue, ...(v.variantOptions ? { options: v.variantOptions } : {}) },
        ])
      ),
    } : {}),
    children,
  };
}
