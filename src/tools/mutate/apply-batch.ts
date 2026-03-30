import { randomUUID } from "node:crypto";
import type { ToolContext } from "../../shared/context.js";
import type { ActionResult, BatchRecord } from "../../shared/types.js";
import { type Action, batchPayloadSchema, computeInverse } from "../../shared/actions.js";

interface ApplyBatchParams {
  planId?: string;
  actions?: Action[];
  dryRun?: boolean;
}

const MAX_BATCH_SIZE = 50;
const ERROR_RATE_THRESHOLD = 0.2;

export async function handleApplyBatch(
  ctx: ToolContext,
  params: ApplyBatchParams
): Promise<{
  batchId?: string;
  dryRun: boolean;
  totalActions: number;
  results: ActionResult[];
  summary: { applied: number; failed: number; skipped: number };
  batch?: BatchRecord;
}> {
  const { planId, dryRun = true } = params;

  // Resolve actions from plan or direct input
  let actions: Action[];
  let resolvedPlanId: string;

  if (planId) {
    const plan = ctx.stateManager.getPlan(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);
    if (plan.status === "applied") throw new Error(`Plan ${planId} already applied`);
    actions = plan.actions;
    resolvedPlanId = planId;
  } else if (params.actions && params.actions.length > 0) {
    actions = params.actions;
    resolvedPlanId = `direct-${randomUUID()}`;
  } else {
    throw new Error("Either planId or actions[] must be provided");
  }

  // Plugin connection guard
  if (!dryRun && !ctx.hub.hasPlugin()) {
    throw new Error(
      "No Figma plugin connected. Open the plugin in Figma before applying mutations."
    );
  }

  // Dry run: just report what would happen
  if (dryRun) {
    const results: ActionResult[] = actions.map((action, i) => ({
      actionIndex: i,
      type: action.type,
      status: "skipped" as const,
      nodeId: "nodeId" in action ? (action as { nodeId: string }).nodeId : undefined,
    }));

    return {
      dryRun: true,
      totalActions: actions.length,
      results,
      summary: { applied: 0, failed: 0, skipped: actions.length },
    };
  }

  // Real execution: chunk into batches of MAX_BATCH_SIZE
  const allResults: ActionResult[] = [];
  const inverseActions: Action[] = [];

  for (let offset = 0; offset < actions.length; offset += MAX_BATCH_SIZE) {
    const chunk = actions.slice(offset, offset + MAX_BATCH_SIZE);
    const requestId = randomUUID();

    const payload = batchPayloadSchema.parse({
      requestId,
      dryRun: false,
      stopOnError: false,
      actions: chunk,
    });

    const pluginResult = await ctx.hub.sendAndWait<{
      requestId: string;
      summary: { planned: number; applied: number; failed: number };
      results: Array<{
        actionIndex: number;
        type: string;
        status: "planned" | "applied" | "failed";
        nodeId?: string;
        before?: unknown;
        after?: unknown;
        error?: string;
      }>;
    }>(payload);

    // Map plugin results to our format and compute inverses
    for (const r of pluginResult.results) {
      const globalIndex = offset + r.actionIndex;
      allResults.push({
        actionIndex: globalIndex,
        type: r.type,
        status: r.status === "planned" ? "skipped" : r.status,
        nodeId: r.nodeId,
        before: r.before,
        after: r.after,
        error: r.error,
      });

      // Compute inverse for rollback
      if (r.status === "applied" && globalIndex < actions.length) {
        const inverse = computeInverse(actions[globalIndex], {
          before: r.before,
          after: r.after,
        });
        if (inverse) inverseActions.push(inverse);
      }
    }

    // Circuit breaker: check error rate
    const failedCount = allResults.filter((r) => r.status === "failed").length;
    const errorRate = failedCount / allResults.length;
    if (errorRate > ERROR_RATE_THRESHOLD && allResults.length >= 5) {
      // Mark remaining as skipped
      for (let i = offset + chunk.length; i < actions.length; i++) {
        allResults.push({
          actionIndex: i,
          type: actions[i].type,
          status: "skipped",
          error: "Circuit breaker: error rate exceeded 20%",
        });
      }
      break;
    }
  }

  // Invalidate snapshot cache after mutations
  ctx.snapshotCache.invalidateAll();
  ctx.stateManager.incrementSnapshot();

  // Record batch in state
  const applied = allResults.filter((r) => r.status === "applied").length;
  const failed = allResults.filter((r) => r.status === "failed").length;
  const skipped = allResults.filter((r) => r.status === "skipped").length;

  const batch = ctx.stateManager.addBatch(
    resolvedPlanId,
    actions,
    inverseActions,
    allResults
  );
  await ctx.stateManager.save();

  return {
    batchId: batch.batchId,
    dryRun: false,
    totalActions: actions.length,
    results: allResults,
    summary: { applied, failed, skipped },
    batch,
  };
}
