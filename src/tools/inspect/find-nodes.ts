import type { ToolContext } from "../../shared/context.js";
import type { EnrichedNode, NodeClassification } from "../../shared/types.js";
import { handleGetTree } from "./get-tree.js";

interface FindNodesParams {
  nodeId: string;
  namePattern?: string;
  type?: string;
  classification?: NodeClassification;
  textContent?: string;
  componentId?: string;
  hasChildren?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  limit?: number;
}

interface FoundNode {
  id: string;
  name: string;
  type: string;
  classification: NodeClassification;
  depth: number;
  childCount: number;
  bounds?: { x: number; y: number; width: number; height: number };
  textContent?: string;
  componentId?: string;
  isComponent: boolean;
  isInstance: boolean;
}

interface FindNodesResult {
  matches: FoundNode[];
  totalScanned: number;
  truncated: boolean;
}

/**
 * Search/filter nodes in a Figma tree by various criteria.
 * Uses the cached enriched tree to avoid re-fetching.
 */
export async function handleFindNodes(
  ctx: ToolContext,
  params: FindNodesParams
): Promise<FindNodesResult> {
  const { nodeId, limit = 50 } = params;

  // Get enriched tree (uses cache if available)
  const { tree } = await handleGetTree(ctx, { nodeId, includeStyles: false });

  const matches: FoundNode[] = [];
  let totalScanned = 0;

  const nameRegex = params.namePattern ? new RegExp(params.namePattern, "i") : null;
  const textRegex = params.textContent ? new RegExp(params.textContent, "i") : null;

  walkTree(tree, (node) => {
    totalScanned++;

    // Apply filters — all must match
    if (nameRegex && !nameRegex.test(node.name)) return;
    if (params.type && node.type.toUpperCase() !== params.type.toUpperCase()) return;
    if (params.classification && node.classification !== params.classification) return;
    if (textRegex && (!node.textContent || !textRegex.test(node.textContent))) return;
    if (params.componentId && node.componentId !== params.componentId) return;
    if (params.hasChildren !== undefined) {
      if (params.hasChildren && node.childCount === 0) return;
      if (!params.hasChildren && node.childCount > 0) return;
    }
    if (params.minWidth !== undefined && (!node.bounds || node.bounds.width < params.minWidth)) return;
    if (params.maxWidth !== undefined && (!node.bounds || node.bounds.width > params.maxWidth)) return;
    if (params.minHeight !== undefined && (!node.bounds || node.bounds.height < params.minHeight)) return;
    if (params.maxHeight !== undefined && (!node.bounds || node.bounds.height > params.maxHeight)) return;

    if (matches.length < limit) {
      matches.push({
        id: node.id,
        name: node.name,
        type: node.type,
        classification: node.classification,
        depth: node.depth,
        childCount: node.childCount,
        bounds: node.bounds,
        textContent: node.textContent,
        componentId: node.componentId,
        isComponent: node.isComponent,
        isInstance: node.isInstance,
      });
    }
  });

  return {
    matches,
    totalScanned,
    truncated: matches.length >= limit,
  };
}

function walkTree(node: EnrichedNode, visit: (n: EnrichedNode) => void): void {
  visit(node);
  for (const child of node.children) walkTree(child, visit);
}
