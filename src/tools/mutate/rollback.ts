import type { ToolContext } from "../../shared/context.js";
import { rollbackBatch, type RollbackResult } from "../../pipeline/rollback.js";

interface RollbackParams {
  batchId: string;
}

export async function handleRollback(
  ctx: ToolContext,
  params: RollbackParams
): Promise<RollbackResult> {
  const result = await rollbackBatch(ctx.stateManager, ctx.hub, params.batchId);

  if (result.success) {
    // Invalidate cache after rollback
    ctx.snapshotCache.invalidateAll();
    ctx.stateManager.incrementSnapshot();
    await ctx.stateManager.save();
  }

  return result;
}
