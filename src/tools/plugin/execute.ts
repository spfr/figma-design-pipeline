import type { BridgeServer, BatchResult } from "../../plugin/bridge.js";
import { compileBatch } from "../../plugin/batch-compiler.js";
import { actionSchema, type Action } from "../../shared/actions.js";

interface ExecuteParams {
  actions: unknown[];
  dryRun?: boolean;
  stopOnError?: boolean;
  rollbackOnError?: boolean;
  timeoutMs?: number;
}

export interface ExecuteResult {
  pluginConnected: boolean;
  result?: BatchResult;
  fallbackJs?: string;
}

export async function handleExecute(
  bridge: BridgeServer | null,
  params: ExecuteParams
): Promise<ExecuteResult> {
  // Validate actions
  const validated: Action[] = [];
  for (const raw of params.actions) {
    const parsed = actionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid action: ${parsed.error.issues.map(i => i.message).join(", ")}`);
    }
    validated.push(parsed.data);
  }

  // Compile batch
  const batch = compileBatch(validated, {
    dryRun: params.dryRun,
    stopOnError: params.stopOnError,
    rollbackOnError: params.rollbackOnError,
  });

  // Try plugin bridge first
  if (bridge?.isConnected()) {
    const result = await bridge.execute(batch, params.timeoutMs);
    return { pluginConnected: true, result };
  }

  // Fallback: generate use_figma JavaScript
  const js = generateFallbackJs(validated);
  return {
    pluginConnected: false,
    fallbackJs: js,
  };
}

/** Generate Plugin API JavaScript from validated actions for use with use_figma fallback. */
function generateFallbackJs(actions: Action[]): string {
  const lines: string[] = [];
  const fontsNeeded = new Set<string>();

  for (const action of actions) {
    if (action.type === "set_text_style" && action.fontFamily) {
      const weight = action.fontWeight || 400;
      const style = weightToStyle(weight);
      fontsNeeded.add(`await figma.loadFontAsync({ family: "${action.fontFamily}", style: "${style}" });`);
    }
    if (action.type === "create_text_style") {
      const weight = action.fontWeight ?? 400;
      const style = weightToStyle(weight);
      fontsNeeded.add(`await figma.loadFontAsync({ family: "${action.fontFamily}", style: "${style}" });`);
    }
  }

  if (fontsNeeded.size > 0) {
    lines.push("// Load fonts");
    for (const font of fontsNeeded) lines.push(font);
    lines.push("");
  }

  lines.push("const results = [];");
  lines.push("");

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    lines.push(`// Action ${i}: ${a.type}`);

    switch (a.type) {
      case "rename":
        lines.push(`{ const n = figma.getNodeById("${a.nodeId}"); n.name = ${JSON.stringify(a.name)}; results.push({ type: "rename", nodeId: "${a.nodeId}" }); }`);
        break;
      case "create_frame":
        lines.push(`{ const f = figma.createFrame(); f.name = ${JSON.stringify(a.name)}; f.resize(${a.width || 100}, ${a.height || 100}); f.x = ${a.x || 0}; f.y = ${a.y || 0}; const p = figma.getNodeById("${a.parentId}"); p.appendChild(f); results.push({ type: "create_frame", nodeId: f.id }); }`);
        break;
      case "set_fills":
        lines.push(`{ const n = figma.getNodeById("${a.nodeId}"); n.fills = ${JSON.stringify(a.fills)}; results.push({ type: "set_fills", nodeId: "${a.nodeId}" }); }`);
        break;
      case "set_layout_mode":
        lines.push(`{ const n = figma.getNodeById("${a.nodeId}"); n.layoutMode = "${a.mode}"; results.push({ type: "set_layout_mode", nodeId: "${a.nodeId}" }); }`);
        break;
      case "set_text_content":
        lines.push(`{ const n = figma.getNodeById("${a.nodeId}"); if (n.fontName !== figma.mixed) { await figma.loadFontAsync(n.fontName); } n.characters = ${JSON.stringify(a.characters)}; results.push({ type: "set_text_content", nodeId: "${a.nodeId}" }); }`);
        break;
      case "create_paint_style":
        lines.push(`{ const s = figma.createPaintStyle(); s.name = ${JSON.stringify(a.name)}; s.paints = ${JSON.stringify(a.paints)}; results.push({ type: "create_paint_style", id: s.id }); }`);
        break;
      case "create_text_style":
        lines.push(`{ const s = figma.createTextStyle(); s.name = ${JSON.stringify(a.name)}; s.fontName = { family: "${a.fontFamily}", style: "${weightToStyle(a.fontWeight ?? 400)}" }; s.fontSize = ${a.fontSize}; results.push({ type: "create_text_style", id: s.id }); }`);
        break;
      default:
        lines.push(`// TODO: ${a.type} — implement manually or use the plugin`);
        break;
    }
    lines.push("");
  }

  lines.push("return results;");
  return lines.join("\n");
}

function weightToStyle(weight: number): string {
  const map: Record<number, string> = {
    100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular",
    500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
  };
  return map[Math.round(weight / 100) * 100] || "Regular";
}
