import type { ToolContext } from "../../shared/context.js";
import type { PlanRecord } from "../../shared/types.js";
import type { Action } from "../../shared/actions.js";
import { detectPatterns, type DetectedPattern } from "../../analysis/pattern-detector.js";
import type { FigmaRawNode } from "../../shared/types.js";

interface PlanComponentsParams {
  nodeId: string;
  minSimilarity?: number;
  minOccurrences?: number;
}

export async function handlePlanComponents(
  ctx: ToolContext,
  params: PlanComponentsParams
): Promise<{
  planId: string;
  nodeId: string;
  actionCount: number;
  actions: Action[];
  patterns: DetectedPattern[];
  plan: PlanRecord;
}> {
  const { nodeId, minSimilarity = 0.8, minOccurrences = 2 } = params;

  // Fetch raw tree for pattern detection
  const data = (await ctx.rest.getFileNodes([nodeId])) as {
    nodes: Record<string, { document: FigmaRawNode }>;
  };
  const rawRoot = data?.nodes?.[nodeId]?.document;
  if (!rawRoot) throw new Error(`Node ${nodeId} not found`);

  // Detect repeated patterns
  const patterns = detectPatterns(rawRoot, minSimilarity, minOccurrences);

  // Generate componentization actions
  const actions: Action[] = [];

  for (const pattern of patterns) {
    // Convert the exemplar to a component
    actions.push({
      type: "create_component_from_node",
      nodeId: pattern.exemplarNodeId,
      name: `Component/${pattern.label}`,
    });

    // Note: After componentization, the other occurrences should be
    // swapped to instances. This requires the component ID from the
    // first action, so we document intent here. The apply-batch handler
    // will need to chain these.
  }

  const plan = ctx.stateManager.addPlan("figma_plan_components", nodeId, actions);
  await ctx.stateManager.save();

  return {
    planId: plan.planId,
    nodeId,
    actionCount: actions.length,
    actions,
    patterns,
    plan,
  };
}
