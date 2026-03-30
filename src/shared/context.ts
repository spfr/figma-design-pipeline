import type { FigmaRestClient } from "../bridge/figma-rest.js";
import type { PluginHub } from "../bridge/plugin-hub.js";
import type { PipelineStateManager } from "../pipeline/state.js";
import type { SnapshotCache } from "../pipeline/snapshot.js";

/** Shared context passed to all tool handlers */
export interface ToolContext {
  rest: FigmaRestClient;
  hub: PluginHub;
  stateManager: PipelineStateManager;
  snapshotCache: SnapshotCache;
}
