import type { BridgeServer, BridgeStatus } from "../../plugin/bridge.js";

export function handlePluginStatus(bridge: BridgeServer | null): BridgeStatus {
  if (!bridge) {
    return { connected: false, port: null, pendingBatches: 0 };
  }
  return bridge.getStatus();
}
