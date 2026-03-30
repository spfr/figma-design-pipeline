/// <reference types="@figma/plugin-typings" />

// ─── Figma Design Pipeline Plugin ─────────────────────────────────
// Architecture: code.ts (sandbox, Figma API) <-> ui.html (browser, WebSocket)
// The UI iframe handles WebSocket to the bridge server.
// Messages are relayed via figma.ui.postMessage / figma.ui.onmessage.

// __BRIDGE_PORT__ is injected at build time by esbuild (see scripts/build-plugin.mjs)
declare const __BRIDGE_PORT__: string;
const PREFERRED_BRIDGE_PORT = Number(
  typeof __BRIDGE_PORT__ !== "undefined" ? __BRIDGE_PORT__ : "4010"
);

// Show hidden UI that manages the WebSocket connection
figma.showUI(
  `<script>
const PREFERRED_BRIDGE_PORT = ` + JSON.stringify(String(PREFERRED_BRIDGE_PORT)) + `;
const BRIDGE_PORTS = Array.from({ length: 5 }, function(_, index) {
  return String(Number(PREFERRED_BRIDGE_PORT) + index);
});
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

let ws = null;
let reconnectDelay = RECONNECT_DELAY_MS;
let reconnectTimer = null;
let portIndex = 0;

function bridgeUrl() {
  return "ws://127.0.0.1:" + BRIDGE_PORTS[portIndex] + "/plugin";
}

function connectBridge() {
  if (ws) { try { ws.close(); } catch(e) {} }
  const url = bridgeUrl();
  console.log("[ui] Connecting to bridge at " + url + "...");
  ws = new WebSocket(url);

  ws.onopen = function() {
    console.log("[ui] Connected to bridge on port " + BRIDGE_PORTS[portIndex]);
    reconnectDelay = RECONNECT_DELAY_MS;
    // Ask plugin code for handshake data
    parent.postMessage({ pluginMessage: { type: "get_handshake" } }, "*");
  };

  ws.onmessage = function(event) {
    try {
      var data = JSON.parse(event.data);
      // Forward batch payload from bridge to plugin code
      parent.postMessage({ pluginMessage: { type: "batch_request", payload: data } }, "*");
    } catch(e) {
      console.error("[ui] Invalid JSON from bridge:", e);
    }
  };

  ws.onclose = function() {
    console.log("[ui] Disconnected. Reconnecting in " + (reconnectDelay / 1000) + "s...");
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = function(err) {
    console.error("[ui] WebSocket error:", err);
  };
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(function() {
    reconnectTimer = null;
    portIndex = (portIndex + 1) % BRIDGE_PORTS.length;
    connectBridge();
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS);
  }, reconnectDelay);
}

// Receive messages from plugin code
window.onmessage = function(event) {
  var msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === "handshake_data" && ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg.payload));
    console.log("[ui] Sent handshake to bridge");
  }

  if (msg.type === "batch_response" && ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg.payload));
    console.log("[ui] Sent batch response to bridge");
  }
};

connectBridge();
</script>`,
  { visible: false, width: 0, height: 0 }
);

// ─── Node helpers ─────────────────────────────────────────────────

function findNode(nodeId: string): BaseNode {
  const node = figma.getNodeById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  return node;
}

function findSceneNode(nodeId: string): SceneNode {
  const node = findNode(nodeId);
  if (!("parent" in node)) throw new Error(`Not a scene node: ${nodeId}`);
  return node as SceneNode;
}

// ─── Font Weight Helpers ─────────────────────────────────────────

const WEIGHT_TO_STYLE: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

const STYLE_TO_WEIGHT: Record<string, number> = {};
for (const [w, s] of Object.entries(WEIGHT_TO_STYLE)) {
  STYLE_TO_WEIGHT[s] = Number(w);
  STYLE_TO_WEIGHT[s.toLowerCase()] = Number(w);
}
// Common aliases
STYLE_TO_WEIGHT["Normal"] = 400;
STYLE_TO_WEIGHT["normal"] = 400;
STYLE_TO_WEIGHT["Demi Bold"] = 600;
STYLE_TO_WEIGHT["DemiBold"] = 600;
STYLE_TO_WEIGHT["Semi Bold"] = 600;
STYLE_TO_WEIGHT["Extra Bold"] = 800;
STYLE_TO_WEIGHT["Ultra Light"] = 200;
STYLE_TO_WEIGHT["Ultra Bold"] = 900;
STYLE_TO_WEIGHT["Hairline"] = 100;

function fontStyleToWeight(style: string): number {
  // Try exact match first
  if (STYLE_TO_WEIGHT[style] !== undefined) return STYLE_TO_WEIGHT[style];
  // Try case-insensitive
  const lower = style.toLowerCase();
  if (STYLE_TO_WEIGHT[lower] !== undefined) return STYLE_TO_WEIGHT[lower];
  // Try extracting weight keyword from compound styles like "Bold Italic"
  for (const [key, weight] of Object.entries(STYLE_TO_WEIGHT)) {
    if (lower.includes(key.toLowerCase())) return weight;
  }
  return 400; // Default to Regular
}

function weightToFontStyle(weight: number): string {
  // Snap to nearest 100
  const snapped = Math.round(weight / 100) * 100;
  return WEIGHT_TO_STYLE[snapped] || "Regular";
}

// ─── Action Handlers ──────────────────────────────────────────────

function handleRename(action: { nodeId: string; name: string }) {
  const node = findNode(action.nodeId);
  if (!("name" in node)) throw new Error("Node is not nameable");
  const before = node.name;
  node.name = action.name;
  return { before, after: node.name };
}

function handleMove(action: {
  nodeId: string;
  targetParentId: string;
  insertIndex?: number;
}) {
  const node = findSceneNode(action.nodeId);
  const parent = findNode(action.targetParentId);
  if (!("appendChild" in parent)) throw new Error("Target is not a container");
  const parentNode = node.parent;
  const beforeParentId = parentNode ? parentNode.id : undefined;
  const beforeIndex = parentNode
    ? Array.from((parentNode as ChildrenMixin).children).indexOf(
        node as SceneNode
      )
    : -1;
  const container = parent as FrameNode;
  if (action.insertIndex !== undefined) {
    container.insertChild(action.insertIndex, node);
  } else {
    container.appendChild(node);
  }
  return {
    before: { parentId: beforeParentId, index: beforeIndex },
    after: { parentId: action.targetParentId },
  };
}

function handleCreateFrame(action: {
  name: string;
  parentId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const parent = findNode(action.parentId);
  if (!("appendChild" in parent)) throw new Error("Parent is not a container");
  const frame = figma.createFrame();
  frame.name = action.name;
  frame.x = action.x;
  frame.y = action.y;
  frame.resize(action.width, action.height);
  (parent as FrameNode).appendChild(frame);
  return { before: null, after: frame.id };
}

function handleDeleteNode(action: { nodeId: string; confirmed: true }) {
  const node = findSceneNode(action.nodeId);
  const parentNode = node.parent;
  const before = { name: node.name, parentId: parentNode ? parentNode.id : undefined };
  node.remove();
  return { before, after: null };
}

function handleSetLayoutMode(action: {
  nodeId: string;
  mode: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
}) {
  const node = findSceneNode(action.nodeId);
  if (!("layoutMode" in node))
    throw new Error("Node doesn't support layout mode");
  const frame = node as FrameNode;
  const before = {
    layoutMode: frame.layoutMode,
    primaryAxisSizingMode: frame.primaryAxisSizingMode,
    counterAxisSizingMode: frame.counterAxisSizingMode,
  };
  frame.layoutMode = action.mode as "HORIZONTAL" | "VERTICAL" | "NONE";
  if (action.primaryAxisSizingMode) {
    frame.primaryAxisSizingMode = action.primaryAxisSizingMode as
      | "FIXED"
      | "AUTO";
  }
  if (action.counterAxisSizingMode) {
    frame.counterAxisSizingMode = action.counterAxisSizingMode as
      | "FIXED"
      | "AUTO";
  }
  return {
    before,
    after: {
      layoutMode: frame.layoutMode,
      primaryAxisSizingMode: frame.primaryAxisSizingMode,
      counterAxisSizingMode: frame.counterAxisSizingMode,
    },
  };
}

function handleSetSpacing(action: {
  nodeId: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}) {
  const node = findSceneNode(action.nodeId);
  if (!("layoutMode" in node))
    throw new Error("Node doesn't support spacing");
  const frame = node as FrameNode;
  const before = {
    itemSpacing: frame.itemSpacing,
    paddingTop: frame.paddingTop,
    paddingRight: frame.paddingRight,
    paddingBottom: frame.paddingBottom,
    paddingLeft: frame.paddingLeft,
  };
  if (action.itemSpacing !== undefined) frame.itemSpacing = action.itemSpacing;
  if (action.paddingTop !== undefined) frame.paddingTop = action.paddingTop;
  if (action.paddingRight !== undefined)
    frame.paddingRight = action.paddingRight;
  if (action.paddingBottom !== undefined)
    frame.paddingBottom = action.paddingBottom;
  if (action.paddingLeft !== undefined) frame.paddingLeft = action.paddingLeft;
  return {
    before,
    after: {
      itemSpacing: frame.itemSpacing,
      paddingTop: frame.paddingTop,
      paddingRight: frame.paddingRight,
      paddingBottom: frame.paddingBottom,
      paddingLeft: frame.paddingLeft,
    },
  };
}

function handleResize(action: {
  nodeId: string;
  width?: number;
  height?: number;
}) {
  const node = findSceneNode(action.nodeId);
  if (!("resize" in node)) throw new Error("Node is not resizable");
  const resizable = node as FrameNode;
  const before = { width: resizable.width, height: resizable.height };
  const newWidth = action.width !== undefined ? action.width : resizable.width;
  const newHeight = action.height !== undefined ? action.height : resizable.height;
  resizable.resize(newWidth, newHeight);
  return {
    before,
    after: { width: resizable.width, height: resizable.height },
  };
}

function handleSetPosition(action: {
  nodeId: string;
  x?: number;
  y?: number;
}) {
  const node = findSceneNode(action.nodeId);
  const before = { x: node.x, y: node.y };
  if (action.x !== undefined) node.x = action.x;
  if (action.y !== undefined) node.y = action.y;
  return {
    before,
    after: { x: node.x, y: node.y },
  };
}

function handleCreateComponentFromNode(action: {
  nodeId: string;
  name: string;
}) {
  const node = findSceneNode(action.nodeId);
  if (node.type === "INSTANCE")
    throw new Error("Cannot create component from instance");
  const component = figma.createComponentFromNode(node);
  component.name = action.name;
  return { before: action.nodeId, after: component.id };
}

function handleCreateComponentSet(action: {
  componentIds: string[];
  name: string;
}) {
  const components = action.componentIds.map((id) => {
    const node = findSceneNode(id);
    if (node.type !== "COMPONENT")
      throw new Error(`Node ${id} is not a component`);
    return node as ComponentNode;
  });
  const set = figma.combineAsVariants(components, figma.currentPage);
  set.name = action.name;
  return { before: action.componentIds, after: set.id };
}

function handleCreateInstance(action: {
  componentId: string;
  parentId: string;
  x: number;
  y: number;
}) {
  const comp = findNode(action.componentId);
  if (comp.type !== "COMPONENT") throw new Error("Not a component");
  const instance = (comp as ComponentNode).createInstance();
  instance.x = action.x;
  instance.y = action.y;
  const parent = findNode(action.parentId);
  if ("appendChild" in parent)
    (parent as FrameNode).appendChild(instance);
  return { before: null, after: instance.id };
}

function handleSwapInstance(action: {
  instanceId: string;
  newComponentId: string;
}) {
  const node = findSceneNode(action.instanceId);
  if (node.type !== "INSTANCE") throw new Error("Not an instance");
  const comp = findNode(action.newComponentId);
  if (comp.type !== "COMPONENT") throw new Error("New component not found");
  const inst = node as InstanceNode;
  const mainComp = inst.mainComponent;
  const before = mainComp ? mainComp.id : undefined;
  inst.swapComponent(comp as ComponentNode);
  return { before, after: action.newComponentId };
}

function handleSetFills(action: {
  nodeId: string;
  fills: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    opacity?: number;
  }>;
}) {
  const node = findSceneNode(action.nodeId);
  if (!("fills" in node)) throw new Error("Node doesn't support fills");
  const fillable = node as GeometryMixin & SceneNode;
  const before = JSON.parse(JSON.stringify(fillable.fills));
  fillable.fills = action.fills.map((f) => {
    if (f.type === "SOLID" && f.color) {
      const opacity = f.color.a !== undefined ? f.color.a : (f.opacity !== undefined ? f.opacity : 1);
      return {
        type: "SOLID" as const,
        color: { r: f.color.r, g: f.color.g, b: f.color.b },
        opacity: opacity,
      };
    }
    return { type: "SOLID" as const, color: { r: 0, g: 0, b: 0 }, opacity: 1 };
  });
  return { before, after: JSON.parse(JSON.stringify(fillable.fills)) };
}

async function handleSetTextContent(action: {
  nodeId: string;
  characters: string;
}) {
  const node = findNode(action.nodeId);
  if (node.type !== "TEXT") throw new Error("Not a text node");
  const textNode = node as TextNode;
  const before = textNode.characters;
  const font = textNode.fontName as FontName;
  await figma.loadFontAsync(font);
  textNode.characters = action.characters;
  return { before, after: textNode.characters };
}

async function handleSetTextStyle(action: {
  nodeId: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
}) {
  const node = findNode(action.nodeId);
  if (node.type !== "TEXT") throw new Error("Not a text node");
  const textNode = node as TextNode;
  const before = {
    fontSize: textNode.fontSize,
    fontName: textNode.fontName,
    lineHeight: textNode.lineHeight,
    letterSpacing: textNode.letterSpacing,
  };
  const currentFont = textNode.fontName as FontName;
  await figma.loadFontAsync(currentFont);
  if (action.fontSize) textNode.fontSize = action.fontSize;
  if (action.lineHeight)
    textNode.lineHeight = { value: action.lineHeight, unit: "PIXELS" };
  if (action.letterSpacing)
    textNode.letterSpacing = { value: action.letterSpacing, unit: "PIXELS" };
  if (action.fontFamily) {
    const newFont: FontName = {
      family: action.fontFamily,
      style: currentFont.style,
    };
    await figma.loadFontAsync(newFont);
    textNode.fontName = newFont;
  }
  return {
    before,
    after: {
      fontSize: textNode.fontSize,
      fontName: textNode.fontName,
      lineHeight: textNode.lineHeight,
      letterSpacing: textNode.letterSpacing,
    },
  };
}

function handleSetCornerRadius(action: {
  nodeId: string;
  radius?: number;
  radii?: [number, number, number, number];
}) {
  const node = findSceneNode(action.nodeId);
  if (!("cornerRadius" in node))
    throw new Error("Node doesn't support corner radius");
  const rect = node as RectangleNode;
  const before = {
    cornerRadius: rect.cornerRadius,
    topLeftRadius: rect.topLeftRadius,
    topRightRadius: rect.topRightRadius,
    bottomRightRadius: rect.bottomRightRadius,
    bottomLeftRadius: rect.bottomLeftRadius,
  };
  if (action.radii) {
    rect.topLeftRadius = action.radii[0];
    rect.topRightRadius = action.radii[1];
    rect.bottomRightRadius = action.radii[2];
    rect.bottomLeftRadius = action.radii[3];
  } else if (action.radius !== undefined) {
    rect.cornerRadius = action.radius;
  }
  return {
    before,
    after: {
      cornerRadius: rect.cornerRadius,
      topLeftRadius: rect.topLeftRadius,
      topRightRadius: rect.topRightRadius,
      bottomRightRadius: rect.bottomRightRadius,
      bottomLeftRadius: rect.bottomLeftRadius,
    },
  };
}

function handleSetLayoutPositioning(action: {
  nodeId: string;
  positioning: "AUTO" | "ABSOLUTE";
}) {
  const node = findSceneNode(action.nodeId);
  if (!("layoutPositioning" in node))
    throw new Error("Node doesn't support layoutPositioning");
  const before = (node as FrameNode).layoutPositioning;
  (node as FrameNode).layoutPositioning = action.positioning;
  return { before, after: action.positioning };
}

function handleSetVisible(action: { nodeId: string; visible: boolean }) {
  const node = findSceneNode(action.nodeId);
  const before = node.visible;
  node.visible = action.visible;
  return { before, after: node.visible };
}

function handleSetOpacity(action: { nodeId: string; opacity: number }) {
  const node = findSceneNode(action.nodeId);
  if (!("opacity" in node)) throw new Error("Node doesn't support opacity");
  const before = (node as SceneNode & BlendMixin).opacity;
  (node as SceneNode & BlendMixin).opacity = action.opacity;
  return { before, after: (node as SceneNode & BlendMixin).opacity };
}

function handleSetStrokes(action: {
  nodeId: string;
  strokes: Array<{
    type: string;
    color: { r: number; g: number; b: number; a: number };
    opacity?: number;
  }>;
  strokeWeight?: number;
}) {
  const node = findSceneNode(action.nodeId);
  if (!("strokes" in node)) throw new Error("Node doesn't support strokes");
  const strokable = node as GeometryMixin & SceneNode;
  const before = {
    strokes: JSON.parse(JSON.stringify(strokable.strokes)),
    strokeWeight: "strokeWeight" in node ? (node as GeometryMixin).strokeWeight : undefined,
  };
  strokable.strokes = action.strokes.map((s) => {
    const opacity =
      s.color.a !== undefined ? s.color.a : s.opacity !== undefined ? s.opacity : 1;
    return {
      type: "SOLID" as const,
      color: { r: s.color.r, g: s.color.g, b: s.color.b },
      opacity,
    };
  });
  if (action.strokeWeight !== undefined && "strokeWeight" in node) {
    (node as GeometryMixin).strokeWeight = action.strokeWeight;
  }
  return {
    before,
    after: {
      strokes: JSON.parse(JSON.stringify(strokable.strokes)),
      strokeWeight: "strokeWeight" in node ? (node as GeometryMixin).strokeWeight : undefined,
    },
  };
}

function handleSetEffects(action: {
  nodeId: string;
  effects: Array<{
    type: string;
    visible?: boolean;
    radius?: number;
    color?: { r: number; g: number; b: number; a: number };
    offset?: { x: number; y: number };
    spread?: number;
  }>;
}) {
  const node = findSceneNode(action.nodeId);
  if (!("effects" in node)) throw new Error("Node doesn't support effects");
  const blendable = node as SceneNode & BlendMixin;
  const before = JSON.parse(JSON.stringify(blendable.effects));
  blendable.effects = action.effects.map((e) => {
    const base = {
      type: e.type as Effect["type"],
      visible: e.visible !== false,
    };
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
      return {
        ...base,
        color: e.color
          ? { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a }
          : { r: 0, g: 0, b: 0, a: 0.25 },
        offset: e.offset || { x: 0, y: 4 },
        radius: e.radius || 0,
        spread: e.spread || 0,
        blendMode: "NORMAL" as BlendMode,
      };
    }
    // LAYER_BLUR or BACKGROUND_BLUR
    return { ...base, radius: e.radius || 0 };
  }) as Effect[];
  return { before, after: JSON.parse(JSON.stringify(blendable.effects)) };
}

function handleSetAlignment(action: {
  nodeId: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
}) {
  const node = findSceneNode(action.nodeId);
  if (!("layoutMode" in node)) throw new Error("Node doesn't support layout");
  const frame = node as FrameNode;
  const before = {
    primaryAxisAlignItems: frame.primaryAxisAlignItems,
    counterAxisAlignItems: frame.counterAxisAlignItems,
  };
  if (action.primaryAxisAlignItems) {
    frame.primaryAxisAlignItems = action.primaryAxisAlignItems as
      | "MIN"
      | "CENTER"
      | "MAX"
      | "SPACE_BETWEEN";
  }
  if (action.counterAxisAlignItems) {
    frame.counterAxisAlignItems = action.counterAxisAlignItems as
      | "MIN"
      | "CENTER"
      | "MAX"
      | "BASELINE";
  }
  return {
    before,
    after: {
      primaryAxisAlignItems: frame.primaryAxisAlignItems,
      counterAxisAlignItems: frame.counterAxisAlignItems,
    },
  };
}

function handleDuplicateNode(action: { nodeId: string }) {
  const node = findSceneNode(action.nodeId);
  const clone = node.clone();
  return { before: null, after: { newNodeId: clone.id, name: clone.name } };
}

function handleSetComponentProperties(action: {
  nodeId: string;
  properties: Record<string, string | boolean>;
}) {
  const node = findSceneNode(action.nodeId);
  if (node.type !== "INSTANCE")
    throw new Error("Not an instance — only instances support setProperties()");
  const inst = node as InstanceNode;
  const currentProps = inst.componentProperties;
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(action.properties)) {
    if (currentProps[key]) {
      before[key] = currentProps[key].value;
    }
  }
  inst.setProperties(action.properties);
  const after: Record<string, unknown> = {};
  const updatedProps = inst.componentProperties;
  for (const key of Object.keys(action.properties)) {
    if (updatedProps[key]) {
      after[key] = updatedProps[key].value;
    }
  }
  return { before, after };
}

// ─── Style Handlers ──────────────────────────────────────────────

function handleGetLocalStyles(action: { styleTypes?: string[] }) {
  const types = action.styleTypes || ["PAINT", "TEXT", "EFFECT"];
  const result: {
    paintStyles?: Array<{
      id: string;
      name: string;
      paints: Array<{ type: string; color?: { r: number; g: number; b: number; a: number }; opacity?: number }>;
    }>;
    textStyles?: Array<{
      id: string;
      name: string;
      fontFamily: string;
      fontSize: number;
      fontWeight: number;
      lineHeight: { value: number; unit: string } | null;
      letterSpacing: { value: number; unit: string } | null;
    }>;
    effectStyles?: Array<{
      id: string;
      name: string;
      effects: Array<{
        type: string;
        visible: boolean;
        radius: number;
        color?: { r: number; g: number; b: number; a: number };
        offset?: { x: number; y: number };
        spread?: number;
      }>;
    }>;
  } = {};

  if (types.includes("PAINT")) {
    result.paintStyles = figma.getLocalPaintStyles().map((s) => ({
      id: s.id,
      name: s.name,
      paints: (s.paints as Paint[]).map((p) => {
        if (p.type === "SOLID") {
          return {
            type: "SOLID",
            color: { r: p.color.r, g: p.color.g, b: p.color.b, a: p.opacity !== undefined ? p.opacity : 1 },
          };
        }
        return { type: p.type, opacity: "opacity" in p ? (p as SolidPaint).opacity : 1 };
      }),
    }));
  }

  if (types.includes("TEXT")) {
    result.textStyles = figma.getLocalTextStyles().map((s) => {
      const font = s.fontName as FontName;
      return {
        id: s.id,
        name: s.name,
        fontFamily: font.family,
        fontSize: s.fontSize as number,
        fontWeight: fontStyleToWeight(font.style),
        lineHeight:
          s.lineHeight && typeof s.lineHeight === "object" && "value" in s.lineHeight
            ? { value: (s.lineHeight as { value: number; unit: string }).value, unit: (s.lineHeight as { value: number; unit: string }).unit }
            : null,
        letterSpacing:
          s.letterSpacing && typeof s.letterSpacing === "object" && "value" in s.letterSpacing
            ? { value: (s.letterSpacing as { value: number; unit: string }).value, unit: (s.letterSpacing as { value: number; unit: string }).unit }
            : null,
      };
    });
  }

  if (types.includes("EFFECT")) {
    result.effectStyles = figma.getLocalEffectStyles().map((s) => ({
      id: s.id,
      name: s.name,
      effects: (s.effects as Effect[]).map((e) => {
        const base: {
          type: string;
          visible: boolean;
          radius: number;
          color?: { r: number; g: number; b: number; a: number };
          offset?: { x: number; y: number };
          spread?: number;
        } = {
          type: e.type,
          visible: e.visible,
          radius: e.radius,
        };
        if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
          const shadow = e as DropShadowEffect;
          base.color = { r: shadow.color.r, g: shadow.color.g, b: shadow.color.b, a: shadow.color.a };
          base.offset = { x: shadow.offset.x, y: shadow.offset.y };
          base.spread = shadow.spread;
        }
        return base;
      }),
    }));
  }

  return { before: null, after: result };
}

function handleCreatePaintStyle(action: {
  name: string;
  paints: Array<{ type: string; color: { r: number; g: number; b: number; a: number } }>;
}) {
  const style = figma.createPaintStyle();
  style.name = action.name;
  style.paints = action.paints.map((p) => ({
    type: "SOLID" as const,
    color: { r: p.color.r, g: p.color.g, b: p.color.b },
    opacity: p.color.a !== undefined ? p.color.a : 1,
  }));
  return { before: null, after: { styleId: style.id, name: style.name } };
}

async function handleCreateTextStyle(action: {
  name: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
}) {
  const fontStyle = weightToFontStyle(action.fontWeight);
  await figma.loadFontAsync({ family: action.fontFamily, style: fontStyle });

  const style = figma.createTextStyle();
  style.name = action.name;
  style.fontName = { family: action.fontFamily, style: fontStyle };
  style.fontSize = action.fontSize;
  if (action.lineHeight !== undefined) {
    style.lineHeight = { value: action.lineHeight, unit: "PIXELS" };
  }
  if (action.letterSpacing !== undefined) {
    style.letterSpacing = { value: action.letterSpacing, unit: "PIXELS" };
  }
  return { before: null, after: { styleId: style.id, name: style.name } };
}

function handleCreateEffectStyle(action: {
  name: string;
  effects: Array<{
    type: string;
    visible?: boolean;
    radius?: number;
    color?: { r: number; g: number; b: number; a: number };
    offset?: { x: number; y: number };
    spread?: number;
  }>;
}) {
  const style = figma.createEffectStyle();
  style.name = action.name;
  style.effects = action.effects.map((e) => {
    const base = {
      type: e.type as Effect["type"],
      visible: e.visible !== false,
    };
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
      return {
        ...base,
        color: e.color
          ? { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a }
          : { r: 0, g: 0, b: 0, a: 0.25 },
        offset: e.offset || { x: 0, y: 4 },
        radius: e.radius || 0,
        spread: e.spread || 0,
        blendMode: "NORMAL" as BlendMode,
      };
    }
    return { ...base, radius: e.radius || 0 };
  }) as Effect[];
  return { before: null, after: { styleId: style.id, name: style.name } };
}

async function handleExportNode(action: {
  nodeId: string;
  format: string;
  scale: number;
}) {
  const node = findSceneNode(action.nodeId);
  if (!("exportAsync" in node)) throw new Error("Node is not exportable");
  const exportable = node as SceneNode & ExportMixin;
  const bytes = await exportable.exportAsync({
    format: action.format as "PNG" | "SVG" | "PDF" | "JPG",
    constraint: { type: "SCALE", value: action.scale },
  });
  // Encode as base64 for transport over WebSocket
  let base64 = "";
  const uint8 = new Uint8Array(bytes);
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const chunk = uint8.subarray(i, i + chunkSize);
    const binary = Array.from(chunk)
      .map((b) => String.fromCharCode(b))
      .join("");
    base64 += btoa(binary);
  }
  return {
    before: null,
    after: { format: action.format, byteLength: bytes.byteLength, base64 },
  };
}

// ─── Action Dispatcher ────────────────────────────────────────────

type ActionResult = { before: unknown; after: unknown };

async function executeAction(action: {
  type: string;
  [key: string]: unknown;
}): Promise<ActionResult> {
  switch (action.type) {
    case "rename":
      return handleRename(action as Parameters<typeof handleRename>[0]);
    case "move":
      return handleMove(action as Parameters<typeof handleMove>[0]);
    case "create_frame":
      return handleCreateFrame(
        action as Parameters<typeof handleCreateFrame>[0]
      );
    case "delete_node":
      return handleDeleteNode(
        action as Parameters<typeof handleDeleteNode>[0]
      );
    case "set_layout_mode":
      return handleSetLayoutMode(
        action as Parameters<typeof handleSetLayoutMode>[0]
      );
    case "set_spacing":
      return handleSetSpacing(
        action as Parameters<typeof handleSetSpacing>[0]
      );
    case "resize":
      return handleResize(action as Parameters<typeof handleResize>[0]);
    case "create_component_from_node":
      return handleCreateComponentFromNode(
        action as Parameters<typeof handleCreateComponentFromNode>[0]
      );
    case "create_component_set":
      return handleCreateComponentSet(
        action as Parameters<typeof handleCreateComponentSet>[0]
      );
    case "create_instance":
      return handleCreateInstance(
        action as Parameters<typeof handleCreateInstance>[0]
      );
    case "swap_instance":
      return handleSwapInstance(
        action as Parameters<typeof handleSwapInstance>[0]
      );
    case "set_fills":
      return handleSetFills(action as Parameters<typeof handleSetFills>[0]);
    case "set_text_content":
      return handleSetTextContent(
        action as Parameters<typeof handleSetTextContent>[0]
      );
    case "set_text_style":
      return handleSetTextStyle(
        action as Parameters<typeof handleSetTextStyle>[0]
      );
    case "set_corner_radius":
      return handleSetCornerRadius(
        action as Parameters<typeof handleSetCornerRadius>[0]
      );
    case "export_node":
      return handleExportNode(
        action as Parameters<typeof handleExportNode>[0]
      );
    case "set_position":
      return handleSetPosition(
        action as Parameters<typeof handleSetPosition>[0]
      );
    case "set_layout_positioning":
      return handleSetLayoutPositioning(
        action as Parameters<typeof handleSetLayoutPositioning>[0]
      );
    case "set_visible":
      return handleSetVisible(action as Parameters<typeof handleSetVisible>[0]);
    case "set_opacity":
      return handleSetOpacity(action as Parameters<typeof handleSetOpacity>[0]);
    case "set_strokes":
      return handleSetStrokes(
        action as Parameters<typeof handleSetStrokes>[0]
      );
    case "set_effects":
      return handleSetEffects(
        action as Parameters<typeof handleSetEffects>[0]
      );
    case "set_alignment":
      return handleSetAlignment(
        action as Parameters<typeof handleSetAlignment>[0]
      );
    case "duplicate_node":
      return handleDuplicateNode(
        action as Parameters<typeof handleDuplicateNode>[0]
      );
    case "set_component_properties":
      return handleSetComponentProperties(
        action as Parameters<typeof handleSetComponentProperties>[0]
      );
    case "get_local_styles":
      return handleGetLocalStyles(
        action as Parameters<typeof handleGetLocalStyles>[0]
      );
    case "create_paint_style":
      return handleCreatePaintStyle(
        action as Parameters<typeof handleCreatePaintStyle>[0]
      );
    case "create_text_style":
      return handleCreateTextStyle(
        action as Parameters<typeof handleCreateTextStyle>[0]
      );
    case "create_effect_style":
      return handleCreateEffectStyle(
        action as Parameters<typeof handleCreateEffectStyle>[0]
      );
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// ─── Batch Processor ──────────────────────────────────────────────

interface BatchPayload {
  requestId: string;
  dryRun: boolean;
  stopOnError: boolean;
  actions: Array<{ type: string; [key: string]: unknown }>;
}

interface ActionReport {
  index: number;
  type: string;
  status: "planned" | "applied" | "failed" | "skipped";
  before?: unknown;
  after?: unknown;
  error?: string;
}

interface BatchResponse {
  requestId: string;
  dryRun: boolean;
  results: ActionReport[];
  summary: { total: number; applied: number; failed: number; skipped: number };
}

async function processBatch(payload: BatchPayload): Promise<BatchResponse> {
  const results: ActionReport[] = [];
  let failed = 0;
  let applied = 0;
  let skipped = 0;
  let stopProcessing = false;

  for (let i = 0; i < payload.actions.length; i++) {
    const action = payload.actions[i];

    if (stopProcessing) {
      results.push({
        index: i,
        type: action.type,
        status: "skipped",
      });
      skipped++;
      continue;
    }

    if (payload.dryRun) {
      results.push({
        index: i,
        type: action.type,
        status: "planned",
      });
      applied++;
      continue;
    }

    try {
      const result = await executeAction(action);
      results.push({
        index: i,
        type: action.type,
        status: "applied",
        before: result.before,
        after: result.after,
      });
      applied++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        index: i,
        type: action.type,
        status: "failed",
        error: message,
      });
      failed++;
      if (payload.stopOnError) {
        stopProcessing = true;
      }
    }
  }

  return {
    requestId: payload.requestId,
    dryRun: payload.dryRun,
    results,
    summary: {
      total: payload.actions.length,
      applied,
      failed,
      skipped,
    },
  };
}

// ─── Message Handler (from UI iframe) ─────────────────────────────

figma.ui.onmessage = async (msg: { type: string; payload?: unknown }) => {
  if (msg.type === "get_handshake") {
    figma.ui.postMessage({
      type: "handshake_data",
      payload: {
        type: "handshake",
        pluginVersion: "1.0.0",
        pageId: figma.currentPage.id,
        pageName: figma.currentPage.name,
        documentName: figma.root.name,
      },
    });
    return;
  }

  if (msg.type === "batch_request") {
    const payload = msg.payload as BatchPayload;

    if (!payload.requestId || !Array.isArray(payload.actions)) {
      console.warn("[plugin] Malformed batch payload, ignoring");
      return;
    }

    console.log(
      `[plugin] Received batch ${payload.requestId}: ${payload.actions.length} actions (dryRun=${payload.dryRun})`
    );

    try {
      const response = await processBatch(payload);
      figma.ui.postMessage({ type: "batch_response", payload: response });
      console.log(
        `[plugin] Batch ${payload.requestId} complete: ${response.summary.applied} applied, ${response.summary.failed} failed, ${response.summary.skipped} skipped`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[plugin] Batch ${payload.requestId} error:`, message);
      figma.ui.postMessage({
        type: "batch_response",
        payload: {
          requestId: payload.requestId,
          dryRun: payload.dryRun,
          results: [],
          summary: { total: 0, applied: 0, failed: 0, skipped: 0 },
          error: message,
        },
      });
    }
  }
};

// Keep plugin alive
figma.on("close", () => {
  // UI iframe and its WebSocket will be cleaned up automatically
});
