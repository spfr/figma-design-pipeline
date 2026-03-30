import type { FigmaRestClient } from "./figma-rest.js";
import type { SnapshotCache } from "../pipeline/snapshot.js";

/** Shared context passed to all tool handlers */
export interface ToolContext {
  rest: FigmaRestClient;
  snapshotCache: SnapshotCache;
}
