import type { BridgeServer, BridgeStatus } from "../../plugin/bridge.js";

export function handlePluginStatus(bridge: BridgeServer | null): BridgeStatus {
  if (!bridge) {
    return {
      connected: false,
      mode: "fallback",
      port: null,
      fallbackAvailable: true,
      message: "Plugin bridge is unavailable. figma_execute can still return fallback use_figma JavaScript.",
      recommendedAction: "Start the figma-design-pipeline MCP server and open the SPFR Design Pipeline plugin in Figma Desktop.",
      pendingBatches: 0,
    };
  }
  return bridge.getStatus();
}
