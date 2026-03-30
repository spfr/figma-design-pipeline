import type { ToolContext } from "../../shared/context.js";
import type { ComponentMapping, EnrichedNode } from "../../shared/types.js";
import { loadRegistry, matchComponent } from "../../codegen/component-registry.js";
import { handleGetTree } from "../inspect/get-tree.js";

interface MapComponentsParams {
  nodeId: string;
  registry?: string;
  hints?: Array<{ nodeId: string; component: string }>;
}

export async function handleMapComponents(
  ctx: ToolContext,
  params: MapComponentsParams
): Promise<{
  nodeId: string;
  mappings: ComponentMapping[];
  unmapped: Array<{ nodeId: string; name: string; classification: string }>;
}> {
  const { nodeId, registry: registryName = "default", hints = [] } = params;

  const { tree } = await handleGetTree(ctx, { nodeId, includeStyles: true });
  const registry = await loadRegistry(registryName);

  const mappings: ComponentMapping[] = [];
  const unmapped: Array<{ nodeId: string; name: string; classification: string }> = [];

  // Walk top-level sections and try to match each
  mapNode(tree, registry, hints, mappings, unmapped);

  // Sort by confidence descending
  mappings.sort((a, b) => b.confidence - a.confidence);

  return { nodeId, mappings, unmapped };
}

function mapNode(
  node: EnrichedNode,
  registry: Awaited<ReturnType<typeof loadRegistry>>,
  hints: Array<{ nodeId: string; component: string }>,
  mappings: ComponentMapping[],
  unmapped: Array<{ nodeId: string; name: string; classification: string }>
): void {
  // Only try to match section-level or significant nodes
  if (isSignificantNode(node)) {
    const match = matchComponent(node, registry, hints);

    if (match && match.confidence > 0.3) {
      // Build prop mappings from registry entry's schemaFields
      const propMappings: Record<string, string> = {};
      if (match.component.schemaFields) {
        for (const [prop, field] of Object.entries(match.component.schemaFields)) {
          propMappings[prop] = field;
        }
      }

      mappings.push({
        figmaNodeId: node.id,
        figmaNodeName: node.name,
        cmsComponent: match.component.id,
        confidence: match.confidence,
        propMappings,
      });
      return; // Don't recurse into matched nodes
    }

    // Only report as unmapped if it's a significant section
    if (node.classification !== "unknown" && node.classification !== "container") {
      unmapped.push({
        nodeId: node.id,
        name: node.name,
        classification: node.classification,
      });
    }
  }

  // Recurse into children
  for (const child of node.children) {
    mapNode(child, registry, hints, mappings, unmapped);
  }
}

function isSignificantNode(node: EnrichedNode): boolean {
  // Top-level sections, cards, heroes, etc.
  const significant = [
    "hero",
    "section",
    "card-grid",
    "cta",
    "quote",
    "nav",
    "footer",
  ];
  if (significant.includes(node.classification)) return true;
  // Also check depth — significant if close to root
  if (node.depth <= 2 && node.childCount > 0) return true;
  return false;
}
