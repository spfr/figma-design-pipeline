import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PipelineState, PipelinePhase, PlanRecord, BatchRecord } from "../shared/types.js";
import type { Action } from "../shared/actions.js";
import { randomUUID } from "node:crypto";

const STATE_DIR = process.env.PIPELINE_STATE_DIR || join(homedir(), ".figma-pipeline");

export class PipelineStateManager {
  private state: PipelineState;
  private filePath: string;

  constructor(fileKey: string) {
    this.filePath = join(STATE_DIR, `state-${fileKey}.json`);
    this.state = {
      fileKey,
      phase: "idle",
      plans: [],
      batches: [],
      snapshotVersion: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  async load(): Promise<PipelineState> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.state = JSON.parse(raw) as PipelineState;
    } catch {
      // File doesn't exist yet, use initial state
    }
    return this.state;
  }

  async save(): Promise<void> {
    this.state.lastUpdated = new Date().toISOString();
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2));
  }

  get current(): PipelineState {
    return this.state;
  }

  setPhase(phase: PipelinePhase): void {
    this.state.phase = phase;
  }

  setRootNode(nodeId: string): void {
    this.state.rootNodeId = nodeId;
  }

  addPlan(toolName: string, nodeId: string, actions: Action[]): PlanRecord {
    const plan: PlanRecord = {
      planId: randomUUID(),
      toolName,
      nodeId,
      actions,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    this.state.plans.push(plan);
    return plan;
  }

  getPlan(planId: string): PlanRecord | undefined {
    return this.state.plans.find((p) => p.planId === planId);
  }

  addBatch(planId: string, actions: Action[], inverseActions: Action[], results: BatchRecord["results"]): BatchRecord {
    const status = results.every((r) => r.status === "applied")
      ? "success"
      : results.some((r) => r.status === "applied")
        ? "partial"
        : "failed";
    const batch: BatchRecord = {
      batchId: randomUUID(),
      planId,
      actions,
      inverseActions,
      appliedAt: new Date().toISOString(),
      results,
      status,
    };
    this.state.batches.push(batch);
    // Mark plan as applied
    const plan = this.getPlan(planId);
    if (plan) plan.status = "applied";
    return batch;
  }

  getBatch(batchId: string): BatchRecord | undefined {
    return this.state.batches.find((b) => b.batchId === batchId);
  }

  markBatchRolledBack(batchId: string): void {
    const batch = this.getBatch(batchId);
    if (batch) batch.status = "rolled-back";
    // Also mark plan
    const plan = this.getPlan(batch?.planId || "");
    if (plan) plan.status = "rolled-back";
  }

  incrementSnapshot(): void {
    this.state.snapshotVersion++;
  }
}
