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

async function findNode(nodeId: string): Promise<BaseNode> {
  const id = resolveId(nodeId);
  const node = await figma.getNodeByIdAsync(id);
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

async function findSceneNode(nodeId: string): Promise<SceneNode> {
  const node = await findNode(nodeId);
  if (!("parent" in node)) throw new Error(`Not a scene node: ${nodeId}`);
  return node as SceneNode;
}

// ─── Font Weight Helpers ────────────────────────────────────────

const WEIGHT_TO_STYLE: Record<number, string> = {
  100: "Thin", 200: "Extra Light", 300: "Light", 400: "Regular",
  500: "Medium", 600: "Semi Bold", 700: "Bold", 800: "Extra Bold", 900: "Black",
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

// ─── Paint Sanitizer (strip 'a' from color — Figma uses paint-level opacity) ──

function sanitizePaints(paints: unknown[]): Paint[] {
  return paints.map((p: any) => {
    if (p && p.color && "a" in p.color) {
      const { a, ...rgb } = p.color;
      const cleaned = { ...p, color: rgb };
      if (a !== undefined && a !== 1 && cleaned.opacity === undefined) {
        cleaned.opacity = a;
      }
      return cleaned;
    }
    return p;
  }) as Paint[];
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
      const node = await findNode(action.nodeId as string);
      const before = { name: node.name };
      node.name = action.name as string;
      return { before, after: { name: node.name } };
    }

    case "move": {
      const node = await findSceneNode(action.nodeId as string);
      const parent = await findNode(action.targetParentId as string);
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

    case "create_text": {
      const parent = await findNode(action.parentId as string);
      if (!("children" in parent)) throw new Error(`Parent ${action.parentId} is not a container`);
      const container = parent as FrameNode;
      const family = (action.fontFamily as string) || "Inter";
      const weight = (action.fontWeight as number) || 400;
      const style = weightToFontStyle(weight);
      await ensureFonts([{ family, style }]);
      const text = figma.createText();
      text.fontName = { family, style };
      text.characters = (action.characters as string) || "";
      if (action.fontSize) text.fontSize = action.fontSize as number;
      if (action.lineHeight) text.lineHeight = { value: action.lineHeight as number, unit: "PIXELS" };
      if (action.letterSpacing) text.letterSpacing = { value: action.letterSpacing as number, unit: "PIXELS" };
      if (action.fills) text.fills = sanitizePaints(action.fills as unknown[]);
      if (action.textCase) text.textCase = action.textCase as TextCase;
      if (action.textAlignHorizontal) text.textAlignHorizontal = action.textAlignHorizontal as "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
      text.textAutoResize = (action.textAutoResize as "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE") || "HEIGHT";
      if (action.name) text.name = action.name as string;
      container.appendChild(text);
      if (action.layoutSizingHorizontal) text.layoutSizingHorizontal = action.layoutSizingHorizontal as "FILL" | "HUG" | "FIXED";
      if (action.layoutSizingVertical) text.layoutSizingVertical = action.layoutSizingVertical as "FILL" | "HUG" | "FIXED";
      if (action.opacity !== undefined) text.opacity = action.opacity as number;
      return { after: { id: text.id, name: text.name, characters: text.characters }, newNodeId: text.id };
    }

    case "create_frame": {
      const parent = await findNode(action.parentId as string);
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
      const node = await findSceneNode(action.nodeId as string);
      if (node.type === "PAGE" || node.type === "DOCUMENT") throw new Error(`Cannot delete ${node.type} node`);
      const before = captureSnapshot(node);
      node.remove();
      return { before };
    }

    case "resize": {
      const node = await findSceneNode(action.nodeId as string) as FrameNode;
      const before = { width: node.width, height: node.height };
      node.resize(
        (action.width as number) ?? node.width,
        (action.height as number) ?? node.height
      );
      return { before, after: { width: node.width, height: node.height } };
    }

    case "set_position": {
      const node = await findSceneNode(action.nodeId as string);
      const before = { x: node.x, y: node.y };
      if (action.x !== undefined) node.x = action.x as number;
      if (action.y !== undefined) node.y = action.y as number;
      return { before, after: { x: node.x, y: node.y } };
    }

    case "duplicate_node": {
      const node = await findSceneNode(action.nodeId as string);
      const clone = node.clone();
      return { after: { id: clone.id, name: clone.name }, newNodeId: clone.id };
    }

    case "set_layout_mode": {
      const node = await findSceneNode(action.nodeId as string);
      if (!("layoutMode" in node)) throw new Error(`Node ${action.nodeId} does not support layout mode`);
      const frame = node as FrameNode;
      const before = { layoutMode: frame.layoutMode };
      frame.layoutMode = action.mode as "HORIZONTAL" | "VERTICAL" | "NONE";
      if (action.primaryAxisSizingMode) frame.primaryAxisSizingMode = action.primaryAxisSizingMode as "FIXED" | "AUTO";
      if (action.counterAxisSizingMode) frame.counterAxisSizingMode = action.counterAxisSizingMode as "FIXED" | "AUTO";
      return { before, after: { layoutMode: frame.layoutMode } };
    }

    case "set_layout_positioning": {
      const node = await findSceneNode(action.nodeId as string) as FrameNode;
      const before = { layoutPositioning: node.layoutPositioning };
      node.layoutPositioning = action.positioning as "AUTO" | "ABSOLUTE";
      return { before, after: { layoutPositioning: node.layoutPositioning } };
    }

    case "set_alignment": {
      const node = await findSceneNode(action.nodeId as string);
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
      const node = await findSceneNode(action.nodeId as string);
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
      const node = await findSceneNode(action.nodeId as string) as GeometryMixin & SceneNode;
      const before = { fills: safeSerialize(node.fills) };
      node.fills = sanitizePaints(action.fills as unknown[]);
      return { before, after: { fills: safeSerialize(node.fills) } };
    }

    case "set_strokes": {
      const node = await findSceneNode(action.nodeId as string) as GeometryMixin & SceneNode;
      const before = { strokes: safeSerialize(node.strokes), strokeWeight: safeSerialize((node as FrameNode).strokeWeight) };
      node.strokes = sanitizePaints(action.strokes as unknown[]);
      if (action.strokeWeight !== undefined) (node as FrameNode).strokeWeight = action.strokeWeight as number;
      return { before, after: { strokes: safeSerialize(node.strokes) } };
    }

    case "set_effects": {
      const node = await findSceneNode(action.nodeId as string) as BlendMixin & SceneNode;
      const before = { effects: JSON.parse(JSON.stringify(node.effects)) };
      node.effects = action.effects as Effect[];
      return { before, after: { effects: JSON.parse(JSON.stringify(node.effects)) } };
    }

    case "set_corner_radius": {
      const node = await findSceneNode(action.nodeId as string) as FrameNode;
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
      const node = await findSceneNode(action.nodeId as string);
      const before = { visible: node.visible };
      node.visible = action.visible as boolean;
      return { before, after: { visible: node.visible } };
    }

    case "set_opacity": {
      const node = await findSceneNode(action.nodeId as string) as BlendMixin & SceneNode;
      const before = { opacity: node.opacity };
      node.opacity = action.opacity as number;
      return { before, after: { opacity: node.opacity } };
    }

    case "set_text_content": {
      const node = await findSceneNode(action.nodeId as string) as TextNode;
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
      const node = await findSceneNode(action.nodeId as string) as TextNode;
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
      const node = await findSceneNode(action.nodeId as string);
      const comp = figma.createComponentFromNode(node);
      comp.name = action.name as string;
      return { after: { id: comp.id, name: comp.name }, newNodeId: comp.id };
    }

    case "create_component_set": {
      const ids = (action.componentIds as string[]).map(resolveId);
      const comps = await Promise.all(ids.map(async id => {
        const node = await figma.getNodeByIdAsync(id);
        if (!node || node.type !== "COMPONENT") throw new Error(`Node ${id} is not a component`);
        return node as ComponentNode;
      }));
      const parent = comps[0].parent;
      if (!parent || !("appendChild" in parent)) throw new Error("Component has no valid parent for variant set");
      const set = figma.combineAsVariants(comps, parent as FrameNode);
      set.name = action.name as string;
      return { after: { id: set.id, name: set.name }, newNodeId: set.id };
    }

    case "create_instance": {
      const comp = await findNode(action.componentId as string) as ComponentNode;
      const instance = comp.createInstance();
      const parent = await findNode(action.parentId as string) as FrameNode;
      parent.appendChild(instance);
      if (action.x !== undefined) instance.x = action.x as number;
      if (action.y !== undefined) instance.y = action.y as number;
      return { after: { id: instance.id }, newNodeId: instance.id };
    }

    case "swap_instance": {
      const instNode = await findSceneNode(action.instanceId as string);
      if (instNode.type !== "INSTANCE") throw new Error(`Node ${action.instanceId} is not an instance`);
      const instance = instNode as InstanceNode;
      const compNode = await findNode(action.newComponentId as string);
      if (compNode.type !== "COMPONENT") throw new Error(`Node ${action.newComponentId} is not a component`);
      const newComp = compNode as ComponentNode;
      instance.swapComponent(newComp);
      return { after: { componentId: newComp.id } };
    }

    case "set_component_properties": {
      const node = await findSceneNode(action.nodeId as string) as InstanceNode;
      const props = action.properties as Record<string, string | boolean>;
      for (const [key, value] of Object.entries(props)) {
        node.setProperties({ [key]: value });
      }
      return { after: { properties: props } };
    }

    case "create_paint_style": {
      const style = figma.createPaintStyle();
      style.name = action.name as string;
      style.paints = sanitizePaints((action.paints as unknown[]) || []);
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
      const node = await findSceneNode(action.nodeId as string);
      const format = (action.format as string) || "PNG";
      const scale = (action.scale as number) || 2;
      const bytes = await node.exportAsync({
        format: format as "PNG" | "SVG" | "PDF" | "JPG",
        ...(format !== "SVG" ? { constraint: { type: "SCALE", value: scale } } : {}),
      });
      const base64 = figma.base64Encode(bytes);
      return { after: { format, size: bytes.byteLength, base64 } };
    }

    // ─── Responsive Layout ────────────────────────────────────────

    case "set_child_layout_sizing": {
      const node = await findSceneNode(action.nodeId as string);
      const before: Record<string, unknown> = {};
      if ("layoutSizingHorizontal" in node) before.layoutSizingHorizontal = (node as FrameNode).layoutSizingHorizontal;
      if ("layoutSizingVertical" in node) before.layoutSizingVertical = (node as FrameNode).layoutSizingVertical;
      if (action.layoutSizingHorizontal) (node as FrameNode).layoutSizingHorizontal = action.layoutSizingHorizontal as "FILL" | "HUG" | "FIXED";
      if (action.layoutSizingVertical) (node as FrameNode).layoutSizingVertical = action.layoutSizingVertical as "FILL" | "HUG" | "FIXED";
      return { before, after: { layoutSizingHorizontal: (node as FrameNode).layoutSizingHorizontal, layoutSizingVertical: (node as FrameNode).layoutSizingVertical } };
    }

    case "set_constraints": {
      const node = await findSceneNode(action.nodeId as string);
      if (!("constraints" in node)) throw new Error(`Node ${action.nodeId} does not support constraints`);
      const before = { constraints: (node as FrameNode).constraints };
      if (action.horizontal) (node as FrameNode).constraints = { ...(node as FrameNode).constraints, horizontal: action.horizontal as ConstraintType };
      if (action.vertical) (node as FrameNode).constraints = { ...(node as FrameNode).constraints, vertical: action.vertical as ConstraintType };
      return { before, after: { constraints: (node as FrameNode).constraints } };
    }

    case "set_min_max_size": {
      const node = await findSceneNode(action.nodeId as string);
      const before: Record<string, unknown> = {};
      if ("minWidth" in node) before.minWidth = (node as FrameNode).minWidth;
      if ("maxWidth" in node) before.maxWidth = (node as FrameNode).maxWidth;
      if (action.minWidth !== undefined) (node as FrameNode).minWidth = action.minWidth as number;
      if (action.maxWidth !== undefined) (node as FrameNode).maxWidth = action.maxWidth as number;
      if (action.minHeight !== undefined) (node as FrameNode).minHeight = action.minHeight as number;
      if (action.maxHeight !== undefined) (node as FrameNode).maxHeight = action.maxHeight as number;
      return { before, after: { minWidth: (node as FrameNode).minWidth, maxWidth: (node as FrameNode).maxWidth, minHeight: (node as FrameNode).minHeight, maxHeight: (node as FrameNode).maxHeight } };
    }

    // ─── Page Management ──────────────────────────────────────────

    case "create_page": {
      const page = figma.createPage();
      page.name = action.name as string;
      return { after: { id: page.id, name: page.name }, newNodeId: page.id };
    }

    case "switch_page": {
      const pageNode = await figma.getNodeByIdAsync(action.pageId as string);
      if (!pageNode || pageNode.type !== "PAGE") throw new Error(`Node ${action.pageId} is not a page`);
      await figma.setCurrentPageAsync(pageNode as PageNode);
      return { after: { pageId: pageNode.id, pageName: pageNode.name } };
    }

    // ─── Rich Content ─────────────────────────────────────────────

    case "set_gradient_fill": {
      const node = await findSceneNode(action.nodeId as string) as GeometryMixin & SceneNode;
      const before = { fills: safeSerialize(node.fills) };
      const stops = (action.stops as Array<{ position: number; color: { r: number; g: number; b: number; a: number } }>);
      const angle = ((action.angle as number) || 0) * Math.PI / 180;
      const gradientType = (action.gradientType as string) || "LINEAR";

      const gradientTransform: Transform = [
        [Math.cos(angle), Math.sin(angle), 0],
        [-Math.sin(angle), Math.cos(angle), 0],
      ];

      const fill: GradientPaint = {
        type: `GRADIENT_${gradientType}` as "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR",
        gradientStops: stops.map(s => ({ position: s.position, color: s.color })),
        gradientTransform,
      };
      node.fills = [fill];
      return { before, after: { fills: safeSerialize(node.fills) } };
    }

    case "set_image_fill": {
      const node = await findSceneNode(action.nodeId as string) as GeometryMixin & SceneNode;
      const before = { fills: safeSerialize(node.fills) };
      const base64 = action.imageBase64 as string;
      const image = figma.createImage(figma.base64Decode(base64));
      const fill: ImagePaint = {
        type: "IMAGE",
        imageHash: image.hash,
        scaleMode: (action.scaleMode as "FILL" | "FIT" | "CROP" | "TILE") || "FILL",
      };
      node.fills = [fill];
      return { before, after: { imageHash: image.hash } };
    }

    // ─── Text Enhancement ─────────────────────────────────────────

    case "set_text_properties": {
      const node = await findSceneNode(action.nodeId as string) as TextNode;
      const before: Record<string, unknown> = {};
      if (action.textAlignHorizontal) {
        before.textAlignHorizontal = node.textAlignHorizontal;
        node.textAlignHorizontal = action.textAlignHorizontal as "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
      }
      if (action.textAlignVertical) {
        before.textAlignVertical = node.textAlignVertical;
        node.textAlignVertical = action.textAlignVertical as "TOP" | "CENTER" | "BOTTOM";
      }
      if (action.paragraphSpacing !== undefined) {
        before.paragraphSpacing = node.paragraphSpacing;
        node.paragraphSpacing = action.paragraphSpacing as number;
      }
      if (action.textCase) {
        node.textCase = action.textCase as TextCase;
      }
      if (action.textDecoration) {
        node.textDecoration = action.textDecoration as TextDecoration;
      }
      if (action.textAutoResize) {
        before.textAutoResize = node.textAutoResize;
        node.textAutoResize = action.textAutoResize as "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE";
      }
      return { before, after: {
        textAlignHorizontal: node.textAlignHorizontal,
        textAlignVertical: node.textAlignVertical,
        paragraphSpacing: node.paragraphSpacing,
        textAutoResize: node.textAutoResize,
      } };
    }

    // ─── Style Binding ────────────────────────────────────────────

    case "apply_style": {
      const node = await findSceneNode(action.nodeId as string);
      const property = action.property as string;
      const styleId = resolveId(action.styleId as string);
      // Figma's dynamic-page document access disallows the sync setters
      // (`node.fillStyleId = x`); the async variants are required.
      if (property === "fill" && "setFillStyleIdAsync" in node) {
        await (node as unknown as { setFillStyleIdAsync: (id: string) => Promise<void> }).setFillStyleIdAsync(styleId);
      } else if (property === "stroke" && "setStrokeStyleIdAsync" in node) {
        await (node as unknown as { setStrokeStyleIdAsync: (id: string) => Promise<void> }).setStrokeStyleIdAsync(styleId);
      } else if (property === "text" && node.type === "TEXT" && "setTextStyleIdAsync" in node) {
        await (node as unknown as { setTextStyleIdAsync: (id: string) => Promise<void> }).setTextStyleIdAsync(styleId);
      } else if (property === "effect" && "setEffectStyleIdAsync" in node) {
        await (node as unknown as { setEffectStyleIdAsync: (id: string) => Promise<void> }).setEffectStyleIdAsync(styleId);
      } else {
        throw new Error(`Cannot apply ${property} style to node type ${node.type}`);
      }
      return { after: { styleId, property } };
    }

    case "set_description": {
      const node = await findNode(action.nodeId as string);
      if (!("description" in node)) throw new Error(`Node ${action.nodeId} does not support descriptions`);
      const before = { description: (node as ComponentNode).description };
      (node as ComponentNode).description = action.description as string;
      return { before, after: { description: (node as ComponentNode).description } };
    }

    // ─── Component Property Definition ────────────────────────────

    case "define_component_property": {
      const node = await findNode(action.nodeId as string);
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
        throw new Error(`Node ${action.nodeId} is not a component or component set`);
      }
      const comp = node as ComponentNode;
      comp.addComponentProperty(
        action.propertyName as string,
        action.propertyType as ComponentPropertyType,
        action.defaultValue as string | boolean
      );
      return { after: { propertyName: action.propertyName, propertyType: action.propertyType } };
    }

    // ─── Figma Variables ──────────────────────────────────────────

    case "create_variable_collection": {
      const collection = figma.variables.createVariableCollection(action.name as string);
      const modes = (action.modes as string[]) || ["Default"];
      // Rename the default mode
      if (modes[0]) collection.renameMode(collection.modes[0].modeId, modes[0]);
      // Add additional modes
      for (let i = 1; i < modes.length; i++) {
        collection.addMode(modes[i]);
      }
      return { after: { id: collection.id, name: collection.name, modes: collection.modes }, newNodeId: collection.id };
    }

    case "create_variable": {
      const collectionId = resolveId(action.collectionId as string);
      const collection = figma.variables.getVariableCollectionById(collectionId);
      if (!collection) throw new Error(`Variable collection not found: ${collectionId}`);
      const variable = figma.variables.createVariable(
        action.name as string,
        collection,
        action.resolvedType as VariableResolvedDataType
      );
      // Set scopes if provided
      if (action.scopes) variable.scopes = action.scopes as VariableScope[];
      // Set value for each mode
      const value = action.value;
      if (action.resolvedType === "COLOR" && typeof value === "string") {
        // Parse hex to Figma color (supports #RGB, #RRGGBB, #RRGGBBAA)
        const cleaned = (value as string).replace("#", "");
        const expanded = cleaned.length === 3
          ? cleaned.split("").map(c => c + c).join("")
          : cleaned;
        const r = parseInt(expanded.substring(0, 2), 16) / 255;
        const g = parseInt(expanded.substring(2, 4), 16) / 255;
        const b = parseInt(expanded.substring(4, 6), 16) / 255;
        const a = expanded.length === 8 ? parseInt(expanded.substring(6, 8), 16) / 255 : 1;
        for (const mode of collection.modes) {
          variable.setValueForMode(mode.modeId, { r, g, b, a });
        }
      } else {
        for (const mode of collection.modes) {
          variable.setValueForMode(mode.modeId, value as string | number | boolean);
        }
      }
      return { after: { id: variable.id, name: variable.name }, newNodeId: variable.id };
    }

    case "bind_variable": {
      const node = await findSceneNode(action.nodeId as string);
      const variableId = resolveId(action.variableId as string);
      const variable = figma.variables.getVariableById(variableId);
      if (!variable) throw new Error(`Variable not found: ${variableId}`);
      const property = action.property as string;
      const paintIndex = (action.paintIndex as number) || 0;

      if (property === "fills" || property === "strokes") {
        const paintsProp = property as "fills" | "strokes";
        const paints = [...((node as GeometryMixin)[paintsProp] as Paint[])];
        if (paints[paintIndex]) {
          paints[paintIndex] = figma.variables.setBoundVariableForPaint(paints[paintIndex] as SolidPaint, "color", variable);
          (node as GeometryMixin)[paintsProp] = paints;
        }
      } else {
        // Numeric properties: spacing, radius, opacity, size
        (node as SceneNode).setBoundVariable(property as VariableBindableNodeField, variable);
      }
      return { after: { variableId: variable.id, property } };
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
    // Shallow copy to avoid mutating the original batch payload
    const action = { ...batch.actions[i] };
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

figma.ui.onmessage = async (msg: { type: string; data?: unknown }) => {
  if (msg.type === "bridge_connected") {
    // Clear font cache on reconnect (fonts may have changed between sessions)
    loadedFonts.clear();
    figma.ui.postMessage({
      type: "send_to_bridge",
      data: {
        type: "handshake",
        pluginVersion: "2.1.0",
        pageId: figma.currentPage.id,
        pageName: figma.currentPage.name,
        documentName: figma.root.name,
      },
    });
    figma.ui.postMessage({
      type: "ui_status",
      status: "connected",
      documentName: figma.root.name,
      pageName: figma.currentPage.name,
      selectionCount: figma.currentPage.selection.length,
    });
    return;
  }

  if (msg.type === "bridge_disconnected") {
    figma.ui.postMessage({
      type: "ui_status",
      status: "disconnected",
      documentName: figma.root.name,
      pageName: figma.currentPage.name,
      selectionCount: figma.currentPage.selection.length,
    });
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

function pushUiContext(status: "idle" | "connected" | "disconnected" = "idle") {
  figma.ui.postMessage({
    type: "ui_status",
    status,
    documentName: figma.root.name,
    pageName: figma.currentPage.name,
    selectionCount: figma.currentPage.selection.length,
  });
}

figma.on("selectionchange", () => {
  pushUiContext();
});

figma.on("currentpagechange", () => {
  pushUiContext();
});

pushUiContext();

figma.on("close", () => {});
