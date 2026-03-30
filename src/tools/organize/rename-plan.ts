import type { ToolContext } from "../../shared/context.js";
import type { EnrichedNode, PlanRecord } from "../../shared/types.js";
import type { Action } from "../../shared/actions.js";
import { isGenericName, proposeSemantic, deduplicateNames, toSlashName } from "../../shared/naming.js";
import { handleGetTree } from "../inspect/get-tree.js";

interface PlanNamingParams {
  nodeId: string;
  convention?: "kebab" | "slash" | "BEM";
  overrides?: Array<{ nodeId: string; name: string }>;
}

export async function handlePlanNaming(
  ctx: ToolContext,
  params: PlanNamingParams
): Promise<{ planId: string; nodeId: string; actionCount: number; actions: Action[]; plan: PlanRecord }> {
  const { nodeId, convention = "slash", overrides = [] } = params;

  const { tree } = await handleGetTree(ctx, { nodeId, includeStyles: false });

  const overrideMap = new Map(overrides.map((o) => [o.nodeId, o.name]));
  const renames: Array<{ nodeId: string; name: string }> = [];

  walkForRenames(tree, overrideMap, renames, convention);

  // Deduplicate names
  const deduplicated = deduplicateNames(renames);

  const actions: Action[] = deduplicated.map((r) => ({
    type: "rename" as const,
    nodeId: r.nodeId,
    name: r.name,
  }));

  const plan = ctx.stateManager.addPlan("figma_plan_naming", nodeId, actions);
  await ctx.stateManager.save();

  return {
    planId: plan.planId,
    nodeId,
    actionCount: actions.length,
    actions,
    plan,
  };
}

function walkForRenames(
  node: EnrichedNode,
  overrideMap: Map<string, string>,
  renames: Array<{ nodeId: string; name: string }>,
  convention: string
): void {
  // Check for manual override first
  if (overrideMap.has(node.id)) {
    renames.push({ nodeId: node.id, name: overrideMap.get(node.id)! });
  } else if (isGenericName(node.name) || !node.name.trim()) {
    // Auto-generate name based on classification and context
    const name = generateName(node, convention);
    renames.push({ nodeId: node.id, name });
  }

  for (const child of node.children) {
    walkForRenames(child, overrideMap, renames, convention);
  }
}

function generateName(node: EnrichedNode, convention: string): string {
  if (convention === "slash") {
    // Use classification as category
    const category = classificationToCategory(node.classification);
    const detail = node.textContent
      ? node.textContent.trim().slice(0, 25).replace(/\n/g, " ")
      : node.classification;
    return toSlashName(category, detail);
  }

  // Default: use proposeSemantic
  return proposeSemantic(
    node.type,
    node.textContent,
    node.childCount,
    node.depth <= 1 ? "top" : node.depth > 5 ? "bottom" : "middle"
  );
}

function classificationToCategory(classification: string): string {
  const map: Record<string, string> = {
    hero: "Section",
    section: "Section",
    card: "Card",
    "card-grid": "Grid",
    cta: "CTA",
    nav: "Nav",
    footer: "Footer",
    quote: "Quote",
    metric: "Metric",
    image: "Image",
    icon: "Icon",
    button: "Button",
    "text-block": "Text",
    heading: "Heading",
    list: "List",
    form: "Form",
    divider: "Divider",
    badge: "Badge",
    overlay: "Overlay",
    container: "Container",
    unknown: "Layer",
  };
  return map[classification] || "Layer";
}
