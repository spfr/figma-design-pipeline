import type { PipelineStateManager } from "./state.js";
import type { PluginHub } from "../bridge/plugin-hub.js";
import type { ActionResult } from "../shared/types.js";
import { randomUUID } from "node:crypto";

export interface RollbackResult {
  batchId: string;
  success: boolean;
  actionsRolledBack: number;
  errors: string[];
}

export async function rollbackBatch(
  stateManager: PipelineStateManager,
  hub: PluginHub,
  batchId: string
): Promise<RollbackResult> {
  const batch = stateManager.getBatch(batchId);
  if (!batch) {
    return { batchId, success: false, actionsRolledBack: 0, errors: [`Batch ${batchId} not found`] };
  }
  if (batch.status === "rolled-back") {
    return { batchId, success: false, actionsRolledBack: 0, errors: ["Batch already rolled back"] };
  }
  if (batch.inverseActions.length === 0) {
    return { batchId, success: false, actionsRolledBack: 0, errors: ["No inverse actions recorded"] };
  }

  if (!hub.hasPlugin()) {
    return { batchId, success: false, actionsRolledBack: 0, errors: ["No plugin connected"] };
  }

  const requestId = randomUUID();
  try {
    const result = await hub.sendAndWait<{
      requestId: string;
      summary: { applied: number; failed: number };
      results: ActionResult[];
    }>({
      requestId,
      dryRun: false,
      stopOnError: true,
      actions: batch.inverseActions as any[],
    });

    const errors = result.results.filter((r) => r.status === "failed").map((r) => r.error || "Unknown error");
    const success = errors.length === 0;

    if (success) {
      stateManager.markBatchRolledBack(batchId);
    }

    return {
      batchId,
      success,
      actionsRolledBack: result.summary.applied,
      errors,
    };
  } catch (err) {
    return {
      batchId,
      success: false,
      actionsRolledBack: 0,
      errors: [err instanceof Error ? err.message : "Unknown error"],
    };
  }
}
