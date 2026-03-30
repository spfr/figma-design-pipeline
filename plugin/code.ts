/// <reference types="@figma/plugin-typings" />

// ─── SPFR Design Pipeline Plugin v2 ──────────────────────────────
// High-performance batch executor with font caching, symbolic refs,
// before/after snapshots, dry-run, and rollback.

figma.showUI(__html__, { visible: true, width: 200, height: 40 });

// ─── Font Cache ─────────────────────────────────────────────────

const loadedFonts = new Map<string, true>();

async function ensureFonts(fonts: Array<{ family: string; style?: string }>): Promise<void> {
  const toLoad: Array<{ family: string; style: string }> = [];
  for (const f of fonts) {
    const style = f.style || "Regular";
    const key = `${f.family}|${style}`;
    if (!loadedFonts.has(key)) {
      toLoad.push({ family: f.family, style });
    }
  }
  if (toLoad.length === 0) return;
  await Promise.all(toLoad.map(async (f) => {
    await figma.loadFontAsync(f);
    loadedFonts.set(`${f.family}|${f.style}`, true);
  }));
}

// ─── Node Ref Resolution ────────────────────────────────────────

const refMap = new Map<string, string>();

function resolveId(id: string): string {
  if (id.startsWith("$ref:")) {
    const real = refMap.get(id);
    if (!real) throw new Error(`Unresolved ref: ${id}`);
    return real;
  }
  return id;
}

function findNode(nodeId: string): BaseNode {
  const id = resolveId(nodeId);
  const node = figma.getNodeById(id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

function findSceneNode(nodeId: string): SceneNode {
  const node = findNode(nodeId);
  if (!("parent" in node)) throw new Error(`Not a scene node: ${nodeId}`);
  return node as SceneNode;
}

// ─── Font Weight Helpers ────────────────────────────────────────

const WEIGHT_TO_STYLE: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular",
  500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

function weightToFontStyle(weight: number): string {
  const snapped = Math.round(weight / 100) * 100;
  return WEIGHT_TO_STYLE[snapped] || "Regular";
}

// ─── Snapshot ───────────────────────────────────────────────────

/** Safely serialize a value that might be figma.mixed (a Symbol that breaks JSON.stringify). */
function safeSerialize(value: unknown): unknown {
  if (typeof value === "symbol") return "mixed";
  try { return JSON.parse(JSON.stringify(value)); } catch { return "mixed"; }
}

function captureSnapshot(node: SceneNode): Record<string, unknown> {
  const snap: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };
  if ("x" in node) { snap.x = node.x; snap.y = node.y; }
  if ("width" in node) { snap.width = node.width; snap.height = node.height; }
  if ("fills" in node) snap.fills = safeSerialize((node as GeometryMixin).fills);
  if ("opacity" in node) snap.opacity = (node as BlendMixin).opacity;
  if ("visible" in node) snap.visible = node.visible;
  if ("layoutMode" in node) snap.layoutMode = (node as FrameNode).layoutMode;
  if ("characters" in node) snap.characters = (node as TextNode).characters;
  if ("cornerRadius" in node) {
    const cr = (node as FrameNode).cornerRadius;
    snap.cornerRadius = typeof cr === "symbol" ? "mixed" : cr;
  }
  return snap;
}

// ─── Action Executors ───────────────────────────────────────────

type ActionResult = {
  actionIndex: number;
  type: string;
  status: "applied" | "planned" | "failed" | "skipped";
  nodeId?: string;
  newNodeId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  error?: string;
};

async function executeAction(action: Record<string, unknown>): Promise<{
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  newNodeId?: string;
}> {
  const type = action.type as string;

  switch (type) {
    case "rename": {
      const node = findNode(action.nodeId as string);
      const before = { name: node.name };
      node.name = action.name as string;
      return { before, after: { name: node.name } };
    }

    case "move": {
      const node = findSceneNode(action.nodeId as string);
      const parent = findNode(action.targetParentId as string);
      if (!("children" in parent)) throw new Error(`Target ${action.targetParentId} is not a container`);
      const container = parent as FrameNode;
      const beforeParent = node.parent?.id;
      if (action.insertIndex !== undefined) {
        container.insertChild(action.insertIndex as number, node);
      } else {
        container.appendChild(node);
      }
      return { before: { parentId: beforeParent }, after: { parentId: container.id } };
    }

    case "create_frame": {
      const parent = findNode(action.parentId as string);
      if (!("children" in parent)) throw new Error(`Parent ${action.parentId} is not a container`);
      const container = parent as FrameNode;
      const frame = figma.createFrame();
      frame.name = action.name as string;
      frame.resize((action.width as number) || 100, (action.height as number) || 100);
      container.appendChild(frame);
      // Set position AFTER appendChild so coordinates are relative to parent
      frame.x = (action.x as number) || 0;
      frame.y = (action.y as number) || 0;
      return { after: { id: frame.id, name: frame.name }, newNodeId: frame.id };
    }

    case "delete_node": {
      const node = findSceneNode(action.nodeId as string);
      if (node.type === "PAGE" || node.type === "DOCUMENT") throw new Error(`Cannot delete ${node.type} node`);
      const before = captureSnapshot(node);
      node.remove();
      return { before };
    }

    case "resize": {
      const node = findSceneNode(action.nodeId as string) as FrameNode;
      const before = { width: node.width, height: node.height };
      node.resize(
        (action.width as number) ?? node.width,
        (action.height as number) ?? node.height
      );
      return { before, after: { width: node.width, height: node.height } };
    }

    case "set_position": {
      const node = findSceneNode(action.nodeId as string);
      const before = { x: node.x, y: node.y };
      if (action.x !== undefined) node.x = action.x as number;
      if (action.y !== undefined) node.y = action.y as number;
      return { before, after: { x: node.x, y: node.y } };
    }

    case "duplicate_node": {
      const node = findSceneNode(action.nodeId as string);
      const clone = node.clone();
      return { after: { id: clone.id, name: clone.name }, newNodeId: clone.id };
    }

    case "set_layout_mode": {
      const node = findSceneNode(action.nodeId as string);
      if (!("layoutMode" in node)) throw new Error(`Node ${action.nodeId} does not support layout mode`);
      const frame = node as FrameNode;
      const before = { layoutMode: frame.layoutMode };
      frame.layoutMode = action.mode as "HORIZONTAL" | "VERTICAL" | "NONE";
      if (action.primaryAxisSizingMode) frame.primaryAxisSizingMode = action.primaryAxisSizingMode as "FIXED" | "AUTO";
      if (action.counterAxisSizingMode) frame.counterAxisSizingMode = action.counterAxisSizingMode as "FIXED" | "AUTO";
      return { before, after: { layoutMode: frame.layoutMode } };
    }

    case "set_layout_positioning": {
      const node = findSceneNode(action.nodeId as string) as FrameNode;
      const before = { layoutPositioning: node.layoutPositioning };
      node.layoutPositioning = action.positioning as "AUTO" | "ABSOLUTE";
      return { before, after: { layoutPositioning: node.layoutPositioning } };
    }

    case "set_alignment": {
      const node = findSceneNode(action.nodeId as string);
      if (!("layoutMode" in node)) throw new Error(`Node ${action.nodeId} does not support alignment`);
      const frame = node as FrameNode;
      const before = {
        primaryAxisAlignItems: frame.primaryAxisAlignItems,
        counterAxisAlignItems: frame.counterAxisAlignItems,
      };
      if (action.primaryAxisAlignItems) frame.primaryAxisAlignItems = action.primaryAxisAlignItems as "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
      if (action.counterAxisAlignItems) frame.counterAxisAlignItems = action.counterAxisAlignItems as "MIN" | "CENTER" | "MAX" | "BASELINE";
      return { before, after: { primaryAxisAlignItems: frame.primaryAxisAlignItems, counterAxisAlignItems: frame.counterAxisAlignItems } };
    }

    case "set_spacing": {
      const node = findSceneNode(action.nodeId as string);
      if (!("layoutMode" in node)) throw new Error(`Node ${action.nodeId} does not support spacing`);
      const frame = node as FrameNode;
      const before = {
        itemSpacing: frame.itemSpacing,
        paddingTop: frame.paddingTop, paddingRight: frame.paddingRight,
        paddingBottom: frame.paddingBottom, paddingLeft: frame.paddingLeft,
      };
      if (action.itemSpacing !== undefined) frame.itemSpacing = action.itemSpacing as number;
      if (action.paddingTop !== undefined) frame.paddingTop = action.paddingTop as number;
      if (action.paddingRight !== undefined) frame.paddingRight = action.paddingRight as number;
      if (action.paddingBottom !== undefined) frame.paddingBottom = action.paddingBottom as number;
      if (action.paddingLeft !== undefined) frame.paddingLeft = action.paddingLeft as number;
      return { before, after: { itemSpacing: frame.itemSpacing, paddingTop: frame.paddingTop, paddingRight: frame.paddingRight, paddingBottom: frame.paddingBottom, paddingLeft: frame.paddingLeft } };
    }

    case "set_fills": {
      const node = findSceneNode(action.nodeId as string) as GeometryMixin & SceneNode;
      const before = { fills: safeSerialize(node.fills) };
      node.fills = action.fills as Paint[];
      return { before, after: { fills: safeSerialize(node.fills) } };
    }

    case "set_strokes": {
      const node = findSceneNode(action.nodeId as string) as GeometryMixin & SceneNode;
      const before = { strokes: safeSerialize(node.strokes), strokeWeight: safeSerialize((node as FrameNode).strokeWeight) };
      node.strokes = action.strokes as Paint[];
      if (action.strokeWeight !== undefined) (node as FrameNode).strokeWeight = action.strokeWeight as number;
      return { before, after: { strokes: safeSerialize(node.strokes) } };
    }

    case "set_effects": {
      const node = findSceneNode(action.nodeId as string) as BlendMixin & SceneNode;
      const before = { effects: JSON.parse(JSON.stringify(node.effects)) };
      node.effects = action.effects as Effect[];
      return { before, after: { effects: JSON.parse(JSON.stringify(node.effects)) } };
    }

    case "set_corner_radius": {
      const node = findSceneNode(action.nodeId as string) as FrameNode;
      const before = { cornerRadius: node.cornerRadius };
      if (action.radius !== undefined) {
        node.cornerRadius = action.radius as number;
      }
      if (action.radii) {
        const [tl, tr, br, bl] = action.radii as [number, number, number, number];
        node.topLeftRadius = tl;
        node.topRightRadius = tr;
        node.bottomRightRadius = br;
        node.bottomLeftRadius = bl;
      }
      return { before, after: { cornerRadius: node.cornerRadius } };
    }

    case "set_visible": {
      const node = findSceneNode(action.nodeId as string);
      const before = { visible: node.visible };
      node.visible = action.visible as boolean;
      return { before, after: { visible: node.visible } };
    }

    case "set_opacity": {
      const node = findSceneNode(action.nodeId as string) as BlendMixin & SceneNode;
      const before = { opacity: node.opacity };
      node.opacity = action.opacity as number;
      return { before, after: { opacity: node.opacity } };
    }

    case "set_text_content": {
      const node = findSceneNode(action.nodeId as string) as TextNode;
      // Handle mixed fonts: load all unique fonts in the text range
      const fontName = node.fontName;
      if (typeof fontName === "symbol") {
        // Mixed fonts — load all unique fonts by scanning segments
        const len = node.characters.length;
        const seen = new Set<string>();
        for (let i = 0; i < len; i++) {
          const f = node.getRangeFontName(i, i + 1) as FontName;
          const key = `${f.family}|${f.style}`;
          if (!seen.has(key)) { seen.add(key); await ensureFonts([f]); }
        }
      } else {
        await ensureFonts([{ family: fontName.family, style: fontName.style }]);
      }
      const before = { characters: node.characters };
      node.characters = action.characters as string;
      return { before, after: { characters: node.characters } };
    }

    case "set_text_style": {
      const node = findSceneNode(action.nodeId as string) as TextNode;
      const currentFont = node.fontName;
      const currentFamily = typeof currentFont === "symbol" ? "Inter" : currentFont.family;
      const currentStyle = typeof currentFont === "symbol" ? "Regular" : currentFont.style;
      const family = (action.fontFamily as string) || currentFamily;
      const weight = action.fontWeight as number | undefined;
      const style = weight ? weightToFontStyle(weight) : currentStyle;
      await ensureFonts([{ family, style }]);
      const before = { fontSize: node.fontSize, fontName: typeof currentFont === "symbol" ? "mixed" : currentFont };
      node.fontName = { family, style };
      if (action.fontSize !== undefined) node.fontSize = action.fontSize as number;
      if (action.lineHeight !== undefined) node.lineHeight = { value: action.lineHeight as number, unit: "PIXELS" };
      if (action.letterSpacing !== undefined) node.letterSpacing = { value: action.letterSpacing as number, unit: "PIXELS" };
      return { before, after: { fontSize: node.fontSize, fontName: node.fontName } };
    }

    case "create_component_from_node": {
      const node = findSceneNode(action.nodeId as string);
      const comp = figma.createComponentFromNode(node);
      comp.name = action.name as string;
      return { after: { id: comp.id, name: comp.name }, newNodeId: comp.id };
    }

    case "create_component_set": {
      const ids = (action.componentIds as string[]).map(resolveId);
      const comps = ids.map(id => {
        const node = figma.getNodeById(id);
        if (!node || node.type !== "COMPONENT") throw new Error(`Node ${id} is not a component`);
        return node as ComponentNode;
      });
      const parent = comps[0].parent;
      if (!parent || !("appendChild" in parent)) throw new Error("Component has no valid parent for variant set");
      const set = figma.combineAsVariants(comps, parent as FrameNode);
      set.name = action.name as string;
      return { after: { id: set.id, name: set.name }, newNodeId: set.id };
    }

    case "create_instance": {
      const comp = findNode(action.componentId as string) as ComponentNode;
      const instance = comp.createInstance();
      const parent = findNode(action.parentId as string) as FrameNode;
      parent.appendChild(instance);
      if (action.x !== undefined) instance.x = action.x as number;
      if (action.y !== undefined) instance.y = action.y as number;
      return { after: { id: instance.id }, newNodeId: instance.id };
    }

    case "swap_instance": {
      const instNode = findSceneNode(action.instanceId as string);
      if (instNode.type !== "INSTANCE") throw new Error(`Node ${action.instanceId} is not an instance`);
      const instance = instNode as InstanceNode;
      const compNode = findNode(action.newComponentId as string);
      if (compNode.type !== "COMPONENT") throw new Error(`Node ${action.newComponentId} is not a component`);
      const newComp = compNode as ComponentNode;
      instance.swapComponent(newComp);
      return { after: { componentId: newComp.id } };
    }

    case "set_component_properties": {
      const node = findSceneNode(action.nodeId as string) as InstanceNode;
      const props = action.properties as Record<string, string | boolean>;
      for (const [key, value] of Object.entries(props)) {
        node.setProperties({ [key]: value });
      }
      return { after: { properties: props } };
    }

    case "create_paint_style": {
      const style = figma.createPaintStyle();
      style.name = action.name as string;
      style.paints = action.paints as Paint[];
      return { after: { id: style.id, name: style.name }, newNodeId: style.id };
    }

    case "create_text_style": {
      const family = action.fontFamily as string;
      const weight = (action.fontWeight as number) || 400;
      const fontStyle = weightToFontStyle(weight);
      await ensureFonts([{ family, style: fontStyle }]);
      const style = figma.createTextStyle();
      style.name = action.name as string;
      style.fontName = { family, style: fontStyle };
      style.fontSize = action.fontSize as number;
      if (action.lineHeight !== undefined) style.lineHeight = { value: action.lineHeight as number, unit: "PIXELS" };
      if (action.letterSpacing !== undefined) style.letterSpacing = { value: action.letterSpacing as number, unit: "PIXELS" };
      return { after: { id: style.id, name: style.name }, newNodeId: style.id };
    }

    case "create_effect_style": {
      const style = figma.createEffectStyle();
      style.name = action.name as string;
      style.effects = action.effects as Effect[];
      return { after: { id: style.id, name: style.name }, newNodeId: style.id };
    }

    case "export_node": {
      const node = findSceneNode(action.nodeId as string);
      const format = (action.format as string) || "PNG";
      const scale = (action.scale as number) || 2;
      const bytes = await node.exportAsync({
        format: format as "PNG" | "SVG" | "PDF" | "JPG",
        ...(format !== "SVG" ? { constraint: { type: "SCALE", value: scale } } : {}),
      });
      const base64 = figma.base64Encode(bytes);
      return { after: { format, size: bytes.byteLength, base64 } };
    }

    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

// ─── Batch Processor ────────────────────────────────────────────

interface Batch {
  batchId: string;
  dryRun: boolean;
  stopOnError: boolean;
  rollbackOnError: boolean;
  requiredFonts: Array<{ family: string; style?: string }>;
  actions: Array<Record<string, unknown>>;
}

interface BatchResult {
  batchId: string;
  dryRun: boolean;
  success: boolean;
  results: ActionResult[];
  nodeIdMap: Record<string, string>;
  summary: { total: number; applied: number; failed: number; skipped: number };
  error?: string;
}

async function processBatch(batch: Batch): Promise<BatchResult> {
  // Clear ref map for this batch
  refMap.clear();

  // Preload all required fonts
  if (batch.requiredFonts.length > 0) {
    await ensureFonts(batch.requiredFonts);
  }

  const results: ActionResult[] = [];
  let applied = 0;
  let mutated = 0; // actual mutations (for rollback count)
  let failed = 0;
  let skipped = 0;
  let stopProcessing = false;

  for (let i = 0; i < batch.actions.length; i++) {
    const action = batch.actions[i];
    const actionType = action.type as string;

    if (stopProcessing) {
      results.push({ actionIndex: i, type: actionType, status: "skipped" });
      skipped++;
      continue;
    }

    if (batch.dryRun) {
      results.push({ actionIndex: i, type: actionType, status: "planned", nodeId: action.nodeId as string });
      applied++;
      continue;
    }

    try {
      // Resolve any $ref: in nodeId, parentId, targetParentId, componentId, instanceId, componentIds
      for (const key of ["nodeId", "parentId", "targetParentId", "componentId", "instanceId"]) {
        if (typeof action[key] === "string" && (action[key] as string).startsWith("$ref:")) {
          action[key] = resolveId(action[key] as string);
        }
      }
      if (Array.isArray(action.componentIds)) {
        action.componentIds = (action.componentIds as string[]).map(id =>
          id.startsWith("$ref:") ? resolveId(id) : id
        );
      }

      const result = await executeAction(action);

      // Register new node ID for symbolic ref
      if (result.newNodeId && action._ref) {
        refMap.set(action._ref as string, result.newNodeId);
      }

      results.push({
        actionIndex: i,
        type: actionType,
        status: "applied",
        nodeId: (action.nodeId as string) || result.newNodeId,
        newNodeId: result.newNodeId,
        before: result.before,
        after: result.after,
      });
      applied++;
      mutated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ actionIndex: i, type: actionType, status: "failed", error: message });
      failed++;
      if (batch.stopOnError) stopProcessing = true;
    }
  }

  // Rollback: Figma coalesces rapid plugin mutations into a single undo entry,
  // so we call triggerUndo() exactly ONCE to undo the entire batch.
  let rollbackApplied = false;
  if (batch.rollbackOnError && failed > 0 && mutated > 0) {
    figma.triggerUndo();
    rollbackApplied = true;
  }

  return {
    batchId: batch.batchId,
    dryRun: batch.dryRun,
    success: failed === 0,
    results,
    nodeIdMap: Object.fromEntries(refMap),
    summary: { total: batch.actions.length, applied, failed, skipped },
    ...(rollbackApplied ? { rollbackApplied: true } : {}),
  };
}

// ─── Message Handler ────────────────────────────────────────────

let bridgeConnected = false;

figma.ui.onmessage = async (msg: { type: string; data?: unknown }) => {
  if (msg.type === "bridge_connected") {
    bridgeConnected = true;
    // Clear font cache on reconnect (fonts may have changed between sessions)
    loadedFonts.clear();
    figma.ui.postMessage({
      type: "send_to_bridge",
      data: {
        type: "handshake",
        pluginVersion: "2.0.0",
        pageId: figma.currentPage.id,
        pageName: figma.currentPage.name,
        documentName: figma.root.name,
      },
    });
    return;
  }

  if (msg.type === "bridge_disconnected") {
    bridgeConnected = false;
    return;
  }

  if (msg.type === "bridge_message") {
    const data = msg.data as Record<string, unknown>;

    if (data.type === "batch") {
      const batch = data as unknown as Batch;
      if (!batch.batchId || !Array.isArray(batch.actions)) {
        console.error("[plugin] Malformed batch payload, ignoring");
        return;
      }
      try {
        const result = await processBatch(batch);
        figma.ui.postMessage({ type: "send_to_bridge", data: { type: "batch_result", ...result } });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        figma.ui.postMessage({
          type: "send_to_bridge",
          data: { type: "batch_result", batchId: batch.batchId, success: false, error: message, results: [], nodeIdMap: {}, summary: { total: 0, applied: 0, failed: 0, skipped: 0 } },
        });
      }
    } else if (data.type === "ping") {
      figma.ui.postMessage({
        type: "send_to_bridge",
        data: { type: "pong", pageId: figma.currentPage.id, pageName: figma.currentPage.name },
      });
    }
  }
};

figma.on("close", () => {});
