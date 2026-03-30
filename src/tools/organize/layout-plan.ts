import type { ToolContext } from "../../shared/context.js";
import type { EnrichedNode, PlanRecord } from "../../shared/types.js";
import type { Action } from "../../shared/actions.js";
import { analyzeLayout, type LayoutSuggestion } from "../../analysis/layout-analyzer.js";
import { handleGetTree } from "../inspect/get-tree.js";

interface PlanLayoutParams {
  nodeId: string;
  scope?: "all" | "top-level" | "leaves";
}

export async function handlePlanLayout(
  ctx: ToolContext,
  params: PlanLayoutParams
): Promise<{
  planId: string;
  nodeId: string;
  actionCount: number;
  actions: Action[];
  suggestions: LayoutSuggestion[];
  plan: PlanRecord;
}> {
  const { nodeId, scope = "all" } = params;

  // Get raw tree for layout analysis (needs absoluteBoundingBox)
  const data = (await ctx.rest.getFileNodes([nodeId])) as {
    nodes: Record<string, { document: import("../../shared/types.js").FigmaRawNode }>;
  };
  const rawRoot = data?.nodes?.[nodeId]?.document;
  if (!rawRoot) throw new Error(`Node ${nodeId} not found`);

  // Also get enriched tree for depth info
  const { tree } = await handleGetTree(ctx, { nodeId, includeStyles: false });

  // Run layout analysis
  let suggestions = analyzeLayout(rawRoot);

  // Filter by scope
  if (scope === "top-level") {
    const topLevelIds = new Set(tree.children.map((c) => c.id));
    suggestions = suggestions.filter((s) => topLevelIds.has(s.nodeId));
  } else if (scope === "leaves") {
    const leafIds = new Set<string>();
    collectLeafIds(tree, leafIds);
    suggestions = suggestions.filter((s) => leafIds.has(s.nodeId));
  }

  // Convert suggestions to actions
  const actions: Action[] = [];
  for (const suggestion of suggestions) {
    if (suggestion.confidence < 0.5) continue;

    // Set layout mode
    actions.push({
      type: "set_layout_mode",
      nodeId: suggestion.nodeId,
      mode: suggestion.suggestedLayout,
      primaryAxisSizingMode: "AUTO",
      counterAxisSizingMode: "AUTO",
    });

    // Set spacing if suggested
    if (suggestion.suggestedSpacing !== undefined) {
      actions.push({
        type: "set_spacing",
        nodeId: suggestion.nodeId,
        itemSpacing: suggestion.suggestedSpacing,
        ...(suggestion.suggestedPadding || {}),
      });
    }
  }

  const plan = ctx.stateManager.addPlan("figma_plan_layout", nodeId, actions);
  await ctx.stateManager.save();

  return { planId: plan.planId, nodeId, actionCount: actions.length, actions, suggestions, plan };
}

function collectLeafIds(node: EnrichedNode, ids: Set<string>): void {
  if (node.childCount === 0 || node.children.length === 0) {
    ids.add(node.id);
    return;
  }
  // Also include frames with children but no grandchildren
  const hasGrandchildren = node.children.some((c) => c.childCount > 0);
  if (!hasGrandchildren) {
    ids.add(node.id);
  }
  for (const child of node.children) collectLeafIds(child, ids);
}
