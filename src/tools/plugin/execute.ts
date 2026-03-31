import type { BridgeServer, BatchResult } from "../../plugin/bridge.js";
import { compileBatch } from "../../plugin/batch-compiler.js";
import { actionSchema, type Action } from "../../shared/actions.js";
import { weightToFontStyle } from "../../shared/font.js";

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
  lines.push("const resolveRefId = (id) => {");
  lines.push("  if (typeof id !== \"string\") return id;");
  lines.push("  const match = id.match(/^\\$ref:node-(\\d+)$/);");
  lines.push("  if (!match) return id;");
  lines.push("  const index = Number(match[1]);");
  lines.push("  const resolved = results[index]?.nodeId;");
  lines.push("  if (!resolved) throw new Error(`Unable to resolve ${id}. Ensure referenced action ran first.`);");
  lines.push("  return resolved;");
  lines.push("};");
  lines.push("const getNode = (id) => figma.getNodeById(resolveRefId(id));");
  lines.push("");

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    lines.push(`// Action ${i}: ${a.type}`);

    const j = JSON.stringify;
    const nid = "nodeId" in a ? a.nodeId : "";
    const g = (id: string) => `getNode(${j(id)})`;
    const r = (t: string, extra = "") => `results.push({ type: "${t}", nodeId: "${nid}"${extra} });`;

    switch (a.type) {
      case "rename":
        lines.push(`{ ${g(nid)}.name = ${j(a.name)}; ${r("rename")} }`);
        break;
      case "move":
        lines.push(`{ const n = ${g(nid)}; const p = ${g(a.targetParentId)}; ${a.insertIndex !== undefined ? `p.insertChild(${a.insertIndex}, n)` : "p.appendChild(n)"}; ${r("move")} }`);
        break;
      case "create_frame":
        lines.push(`{ const f = figma.createFrame(); f.name = ${j(a.name)}; f.resize(${a.width}, ${a.height}); ${g(a.parentId)}.appendChild(f); f.x = ${a.x}; f.y = ${a.y}; results.push({ type: "create_frame", nodeId: f.id }); }`);
        break;
      case "delete_node":
        lines.push(`{ ${g(nid)}.remove(); ${r("delete_node")} }`);
        break;
      case "resize":
        lines.push(`{ const n = ${g(nid)}; n.resize(${a.width ?? "n.width"}, ${a.height ?? "n.height"}); ${r("resize")} }`);
        break;
      case "set_position":
        lines.push(`{ const n = ${g(nid)}; ${a.x !== undefined ? `n.x = ${a.x};` : ""} ${a.y !== undefined ? `n.y = ${a.y};` : ""} ${r("set_position")} }`);
        break;
      case "duplicate_node":
        lines.push(`{ const c = ${g(nid)}.clone(); results.push({ type: "duplicate_node", nodeId: c.id }); }`);
        break;
      case "set_visible":
        lines.push(`{ ${g(nid)}.visible = ${a.visible}; ${r("set_visible")} }`);
        break;
      case "set_opacity":
        lines.push(`{ ${g(nid)}.opacity = ${a.opacity}; ${r("set_opacity")} }`);
        break;
      case "set_layout_mode":
        lines.push(`{ const n = ${g(nid)}; n.layoutMode = "${a.mode}"; ${a.primaryAxisSizingMode ? `n.primaryAxisSizingMode = "${a.primaryAxisSizingMode}";` : ""} ${r("set_layout_mode")} }`);
        break;
      case "set_layout_positioning":
        lines.push(`{ ${g(nid)}.layoutPositioning = "${a.positioning}"; ${r("set_layout_positioning")} }`);
        break;
      case "set_alignment":
        lines.push(`{ const n = ${g(nid)}; ${a.primaryAxisAlignItems ? `n.primaryAxisAlignItems = "${a.primaryAxisAlignItems}";` : ""} ${a.counterAxisAlignItems ? `n.counterAxisAlignItems = "${a.counterAxisAlignItems}";` : ""} ${r("set_alignment")} }`);
        break;
      case "set_spacing":
        lines.push(`{ const n = ${g(nid)}; ${a.itemSpacing !== undefined ? `n.itemSpacing = ${a.itemSpacing};` : ""} ${a.paddingTop !== undefined ? `n.paddingTop = ${a.paddingTop};` : ""} ${a.paddingRight !== undefined ? `n.paddingRight = ${a.paddingRight};` : ""} ${a.paddingBottom !== undefined ? `n.paddingBottom = ${a.paddingBottom};` : ""} ${a.paddingLeft !== undefined ? `n.paddingLeft = ${a.paddingLeft};` : ""} ${r("set_spacing")} }`);
        break;
      case "set_child_layout_sizing":
        lines.push(`{ const n = ${g(nid)}; ${a.layoutSizingHorizontal ? `n.layoutSizingHorizontal = "${a.layoutSizingHorizontal}";` : ""} ${a.layoutSizingVertical ? `n.layoutSizingVertical = "${a.layoutSizingVertical}";` : ""} ${r("set_child_layout_sizing")} }`);
        break;
      case "set_constraints":
        lines.push(`{ const n = ${g(nid)}; ${a.horizontal ? `n.constraints = { ...n.constraints, horizontal: "${a.horizontal}" };` : ""} ${a.vertical ? `n.constraints = { ...n.constraints, vertical: "${a.vertical}" };` : ""} ${r("set_constraints")} }`);
        break;
      case "set_min_max_size":
        lines.push(`{ const n = ${g(nid)}; ${a.minWidth !== undefined ? `n.minWidth = ${a.minWidth};` : ""} ${a.maxWidth !== undefined ? `n.maxWidth = ${a.maxWidth};` : ""} ${a.minHeight !== undefined ? `n.minHeight = ${a.minHeight};` : ""} ${a.maxHeight !== undefined ? `n.maxHeight = ${a.maxHeight};` : ""} ${r("set_min_max_size")} }`);
        break;
      case "set_fills":
        lines.push(`{ ${g(nid)}.fills = ${j(a.fills)}; ${r("set_fills")} }`);
        break;
      case "set_gradient_fill":
        lines.push(`{ const n = ${g(nid)}; n.fills = [{ type: "GRADIENT_${a.gradientType || "LINEAR"}", gradientStops: ${j(a.stops)}, gradientTransform: [[1,0,0],[0,1,0]] }]; ${r("set_gradient_fill")} }`);
        break;
      case "set_image_fill":
        lines.push(`{ const img = figma.createImage(figma.base64Decode(${j(a.imageBase64)})); ${g(nid)}.fills = [{ type: "IMAGE", imageHash: img.hash, scaleMode: "${a.scaleMode || "FILL"}" }]; ${r("set_image_fill")} }`);
        break;
      case "set_strokes":
        lines.push(`{ const n = ${g(nid)}; n.strokes = ${j(a.strokes)}; ${a.strokeWeight !== undefined ? `n.strokeWeight = ${a.strokeWeight};` : ""} ${r("set_strokes")} }`);
        break;
      case "set_effects":
        lines.push(`{ ${g(nid)}.effects = ${j(a.effects)}; ${r("set_effects")} }`);
        break;
      case "set_corner_radius":
        lines.push(`{ const n = ${g(nid)}; ${a.radius !== undefined ? `n.cornerRadius = ${a.radius};` : ""} ${a.radii ? `n.topLeftRadius=${a.radii[0]}; n.topRightRadius=${a.radii[1]}; n.bottomRightRadius=${a.radii[2]}; n.bottomLeftRadius=${a.radii[3]};` : ""} ${r("set_corner_radius")} }`);
        break;
      case "set_text_content":
        lines.push(`{ const n = ${g(nid)}; if (n.fontName !== figma.mixed) { await figma.loadFontAsync(n.fontName); } n.characters = ${j(a.characters)}; ${r("set_text_content")} }`);
        break;
      case "set_text_style": {
        const fam = a.fontFamily || "Inter";
        const sty = weightToStyle(a.fontWeight || 400);
        lines.push(`{ const n = ${g(nid)}; await figma.loadFontAsync({ family: "${fam}", style: "${sty}" }); n.fontName = { family: "${fam}", style: "${sty}" }; ${a.fontSize !== undefined ? `n.fontSize = ${a.fontSize};` : ""} ${a.lineHeight !== undefined ? `n.lineHeight = { value: ${a.lineHeight}, unit: "PIXELS" };` : ""} ${r("set_text_style")} }`);
        break;
      }
      case "set_text_properties":
        lines.push(`{ const n = ${g(nid)}; ${a.textAlignHorizontal ? `n.textAlignHorizontal = "${a.textAlignHorizontal}";` : ""} ${a.textAlignVertical ? `n.textAlignVertical = "${a.textAlignVertical}";` : ""} ${a.paragraphSpacing !== undefined ? `n.paragraphSpacing = ${a.paragraphSpacing};` : ""} ${a.textCase ? `n.textCase = "${a.textCase}";` : ""} ${a.textDecoration ? `n.textDecoration = "${a.textDecoration}";` : ""} ${r("set_text_properties")} }`);
        break;
      case "create_component_from_node":
        lines.push(`{ const c = figma.createComponentFromNode(${g(nid)}); c.name = ${j(a.name)}; results.push({ type: "create_component_from_node", nodeId: c.id }); }`);
        break;
      case "create_component_set":
        lines.push(`{ const comps = ${j(a.componentIds)}.map(id => getNode(id)); const set = figma.combineAsVariants(comps, comps[0].parent); set.name = ${j(a.name)}; results.push({ type: "create_component_set", nodeId: set.id }); }`);
        break;
      case "create_instance":
        lines.push(`{ const inst = ${g(a.componentId)}.createInstance(); ${g(a.parentId)}.appendChild(inst); ${a.x !== undefined ? `inst.x = ${a.x};` : ""} ${a.y !== undefined ? `inst.y = ${a.y};` : ""} results.push({ type: "create_instance", nodeId: inst.id }); }`);
        break;
      case "swap_instance":
        lines.push(`{ ${g(a.instanceId)}.swapComponent(${g(a.newComponentId)}); results.push({ type: "swap_instance" }); }`);
        break;
      case "set_component_properties":
        lines.push(`{ ${g(nid)}.setProperties(${j(a.properties)}); ${r("set_component_properties")} }`);
        break;
      case "define_component_property":
        lines.push(`{ ${g(nid)}.addComponentProperty(${j(a.propertyName)}, "${a.propertyType}", ${j(a.defaultValue)}); ${r("define_component_property")} }`);
        break;
      case "create_paint_style":
        lines.push(`{ const s = figma.createPaintStyle(); s.name = ${j(a.name)}; s.paints = ${j(a.paints)}; results.push({ type: "create_paint_style", nodeId: s.id }); }`);
        break;
      case "create_text_style":
        lines.push(`{ const s = figma.createTextStyle(); s.name = ${j(a.name)}; s.fontName = { family: "${a.fontFamily}", style: "${weightToStyle(a.fontWeight ?? 400)}" }; s.fontSize = ${a.fontSize}; ${a.lineHeight !== undefined ? `s.lineHeight = { value: ${a.lineHeight}, unit: "PIXELS" };` : ""} results.push({ type: "create_text_style", nodeId: s.id }); }`);
        break;
      case "create_effect_style":
        lines.push(`{ const s = figma.createEffectStyle(); s.name = ${j(a.name)}; s.effects = ${j(a.effects)}; results.push({ type: "create_effect_style", nodeId: s.id }); }`);
        break;
      case "apply_style":
        lines.push(`{ const n = ${g(nid)}; n.${"property" in a && a.property === "fill" ? "fillStyleId" : a.property === "stroke" ? "strokeStyleId" : a.property === "text" ? "textStyleId" : "effectStyleId"} = resolveRefId(${j(a.styleId)}); ${r("apply_style")} }`);
        break;
      case "set_description":
        lines.push(`{ ${g(nid)}.description = ${j(a.description)}; ${r("set_description")} }`);
        break;
      case "create_page":
        lines.push(`{ const p = figma.createPage(); p.name = ${j(a.name)}; results.push({ type: "create_page", nodeId: p.id }); }`);
        break;
      case "switch_page":
        lines.push(`{ await figma.setCurrentPageAsync(getNode(${j(a.pageId)})); results.push({ type: "switch_page" }); }`);
        break;
      case "create_variable_collection":
        lines.push(`{ const c = figma.variables.createVariableCollection(${j(a.name)}); results.push({ type: "create_variable_collection", nodeId: c.id }); }`);
        break;
      case "create_variable":
        lines.push(`{ const c = figma.variables.getVariableCollectionById(resolveRefId(${j(a.collectionId)})); const v = figma.variables.createVariable(${j(a.name)}, c, "${a.resolvedType}"); results.push({ type: "create_variable", nodeId: v.id }); }`);
        break;
      case "bind_variable":
        lines.push(`{ const v = figma.variables.getVariableById(resolveRefId(${j(a.variableId)})); const n = ${g(nid)}; n.setBoundVariable("${a.property}", v); ${r("bind_variable")} }`);
        break;
      case "export_node":
        lines.push(`{ const bytes = await ${g(nid)}.exportAsync({ format: "${a.format || "PNG"}" }); results.push({ type: "export_node", base64: figma.base64Encode(bytes) }); }`);
        break;
    }
    lines.push("");
  }

  lines.push("return results;");
  return lines.join("\n");
}

// Re-export for local use — canonical source is src/shared/font.ts
const weightToStyle = weightToFontStyle;
