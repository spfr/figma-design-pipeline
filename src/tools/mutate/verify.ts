import type { ToolContext } from "../../shared/context.js";
import { handleAudit } from "../inspect/audit.js";

interface VerifyParams {
  nodeId: string;
  batchId?: string;
}

export async function handleVerify(
  ctx: ToolContext,
  params: VerifyParams
): Promise<{
  nodeId: string;
  batchId?: string;
  ok: boolean;
  remainingViolations: number;
  batchVerification?: {
    actionsApplied: number;
    actionsExpected: number;
    allApplied: boolean;
  };
  audit: Awaited<ReturnType<typeof handleAudit>>;
}> {
  const { nodeId, batchId } = params;

  // Invalidate cache to get fresh data
  ctx.snapshotCache.invalidate(nodeId);

  // Run a fresh audit
  const audit = await handleAudit(ctx, { nodeId });

  // If batch specified, verify against batch results
  let batchVerification;
  if (batchId) {
    const batch = ctx.stateManager.getBatch(batchId);
    if (batch) {
      const applied = batch.results.filter((r) => r.status === "applied").length;
      batchVerification = {
        actionsApplied: applied,
        actionsExpected: batch.actions.length,
        allApplied: applied === batch.actions.length,
      };
    }
  }

  const ok = audit.violations.filter((v) => v.severity === "error").length === 0;

  return {
    nodeId,
    batchId,
    ok,
    remainingViolations: audit.violations.length,
    batchVerification,
    audit,
  };
}
