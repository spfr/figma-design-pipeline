import { z } from "zod";

// ─── Plugin Action Types (Discriminated Union) ──────────────────────

export const renameActionSchema = z
  .object({
    type: z.literal("rename"),
    nodeId: z.string(),
    name: z.string().min(1),
  })
  .strict();

export const moveActionSchema = z
  .object({
    type: z.literal("move"),
    nodeId: z.string().describe("Node to move"),
    targetParentId: z.string().describe("Target parent container ID"),
    insertIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Zero-based position in target parent's children array. 0 = bottom/back of layer stack, last = top/front. Omit to append (top/front)."
      ),
  })
  .strict();

export const createFrameActionSchema = z
  .object({
    type: z.literal("create_frame"),
    name: z.string().min(1),
    parentId: z.string(),
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number().min(1).default(100),
    height: z.number().min(1).default(100),
  })
  .strict();

export const deleteNodeActionSchema = z
  .object({
    type: z.literal("delete_node"),
    nodeId: z.string(),
    /** Safety: must be explicitly set to true */
    confirmed: z.literal(true),
  })
  .strict();

export const setLayoutModeActionSchema = z
  .object({
    type: z.literal("set_layout_mode"),
    nodeId: z.string(),
    mode: z.enum(["HORIZONTAL", "VERTICAL", "NONE"]),
    primaryAxisSizingMode: z.enum(["FIXED", "AUTO"]).optional(),
    counterAxisSizingMode: z.enum(["FIXED", "AUTO"]).optional(),
  })
  .strict();

export const setSpacingActionSchema = z
  .object({
    type: z.literal("set_spacing"),
    nodeId: z.string(),
    itemSpacing: z.number().min(0).optional(),
    paddingTop: z.number().min(0).optional(),
    paddingRight: z.number().min(0).optional(),
    paddingBottom: z.number().min(0).optional(),
    paddingLeft: z.number().min(0).optional(),
  })
  .strict();

export const resizeActionSchema = z
  .object({
    type: z.literal("resize"),
    nodeId: z.string(),
    width: z.number().min(1).optional(),
    height: z.number().min(1).optional(),
  })
  .strict();

export const createComponentFromNodeActionSchema = z
  .object({
    type: z.literal("create_component_from_node"),
    nodeId: z.string(),
    name: z.string().min(1),
  })
  .strict();

export const createComponentSetActionSchema = z
  .object({
    type: z.literal("create_component_set"),
    componentIds: z.array(z.string()).min(1),
    name: z.string().min(1),
  })
  .strict();

export const createInstanceActionSchema = z
  .object({
    type: z.literal("create_instance"),
    componentId: z.string(),
    parentId: z.string(),
    x: z.number().default(0),
    y: z.number().default(0),
  })
  .strict();

export const swapInstanceActionSchema = z
  .object({
    type: z.literal("swap_instance"),
    instanceId: z.string(),
    newComponentId: z.string(),
  })
  .strict();

export const setFillsActionSchema = z
  .object({
    type: z.literal("set_fills"),
    nodeId: z.string(),
    fills: z.array(
      z.object({
        type: z.enum(["SOLID", "GRADIENT_LINEAR", "IMAGE"]),
        color: z
          .object({
            r: z.number().min(0).max(1),
            g: z.number().min(0).max(1),
            b: z.number().min(0).max(1),
            a: z.number().min(0).max(1).default(1),
          })
          .optional(),
        opacity: z.number().min(0).max(1).optional(),
      })
    ),
  })
  .strict();

export const setTextContentActionSchema = z
  .object({
    type: z.literal("set_text_content"),
    nodeId: z.string(),
    characters: z.string(),
  })
  .strict();

export const setTextStyleActionSchema = z
  .object({
    type: z.literal("set_text_style"),
    nodeId: z.string(),
    fontFamily: z.string().optional(),
    fontSize: z.number().min(1).optional(),
    fontWeight: z.number().optional(),
    lineHeight: z.number().optional(),
    letterSpacing: z.number().optional(),
  })
  .strict();

export const setCornerRadiusActionSchema = z
  .object({
    type: z.literal("set_corner_radius"),
    nodeId: z.string(),
    radius: z.number().min(0).optional(),
    radii: z
      .tuple([z.number(), z.number(), z.number(), z.number()])
      .optional(),
  })
  .strict();

export const exportNodeActionSchema = z
  .object({
    type: z.literal("export_node"),
    nodeId: z.string(),
    format: z.enum(["PNG", "SVG", "PDF", "JPG"]).default("PNG"),
    scale: z.number().min(0.5).max(4).default(2),
  })
  .strict();

export const setPositionActionSchema = z
  .object({
    type: z.literal("set_position"),
    nodeId: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .strict();

export const setLayoutPositioningActionSchema = z
  .object({
    type: z.literal("set_layout_positioning"),
    nodeId: z.string().describe("Child node inside auto-layout parent"),
    positioning: z
      .enum(["AUTO", "ABSOLUTE"])
      .describe(
        "AUTO = in flow, ABSOLUTE = taken out of flow (like CSS position:absolute)"
      ),
  })
  .strict();

export const setVisibleActionSchema = z
  .object({
    type: z.literal("set_visible"),
    nodeId: z.string(),
    visible: z.boolean(),
  })
  .strict();

export const setOpacityActionSchema = z
  .object({
    type: z.literal("set_opacity"),
    nodeId: z.string(),
    opacity: z.number().min(0).max(1),
  })
  .strict();

export const setStrokesActionSchema = z
  .object({
    type: z.literal("set_strokes"),
    nodeId: z.string(),
    strokes: z.array(
      z.object({
        type: z.enum(["SOLID"]),
        color: z.object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).default(1),
        }),
        opacity: z.number().min(0).max(1).optional(),
      })
    ),
    strokeWeight: z.number().min(0).optional(),
  })
  .strict();

export const setEffectsActionSchema = z
  .object({
    type: z.literal("set_effects"),
    nodeId: z.string(),
    effects: z.array(
      z.object({
        type: z.enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]),
        visible: z.boolean().default(true),
        radius: z.number().min(0).default(0),
        color: z
          .object({
            r: z.number().min(0).max(1),
            g: z.number().min(0).max(1),
            b: z.number().min(0).max(1),
            a: z.number().min(0).max(1).default(1),
          })
          .optional(),
        offset: z
          .object({
            x: z.number().default(0),
            y: z.number().default(0),
          })
          .optional(),
        spread: z.number().optional(),
      })
    ),
  })
  .strict();

export const setAlignmentActionSchema = z
  .object({
    type: z.literal("set_alignment"),
    nodeId: z.string(),
    primaryAxisAlignItems: z
      .enum(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"])
      .optional()
      .describe("Main axis alignment (like justify-content)"),
    counterAxisAlignItems: z
      .enum(["MIN", "CENTER", "MAX", "BASELINE"])
      .optional()
      .describe("Cross axis alignment (like align-items)"),
  })
  .strict();

export const duplicateNodeActionSchema = z
  .object({
    type: z.literal("duplicate_node"),
    nodeId: z.string(),
  })
  .strict();

export const setComponentPropertiesActionSchema = z
  .object({
    type: z.literal("set_component_properties"),
    nodeId: z.string().describe("Instance node ID"),
    properties: z.record(z.union([z.string(), z.boolean()])).describe("Property name -> value map"),
  })
  .strict();

// ─── Style actions ───────────────────────────────────────────────────

export const getLocalStylesActionSchema = z
  .object({
    type: z.literal("get_local_styles"),
    styleTypes: z
      .array(z.enum(["PAINT", "TEXT", "EFFECT"]))
      .optional()
      .describe("Which style types to return. Omit for all."),
  })
  .strict();

export const createPaintStyleActionSchema = z
  .object({
    type: z.literal("create_paint_style"),
    name: z.string().min(1).describe("Style name (use '/' for folders, e.g. 'Brand/Primary')"),
    paints: z.array(
      z.object({
        type: z.enum(["SOLID"]),
        color: z.object({
          r: z.number().min(0).max(1),
          g: z.number().min(0).max(1),
          b: z.number().min(0).max(1),
          a: z.number().min(0).max(1).default(1),
        }),
      })
    ),
  })
  .strict();

export const createTextStyleActionSchema = z
  .object({
    type: z.literal("create_text_style"),
    name: z.string().min(1).describe("Style name (use '/' for folders)"),
    fontFamily: z.string().describe("Font family, e.g. 'Inter'"),
    fontWeight: z.number().default(400).describe("Font weight (100-900)"),
    fontSize: z.number().min(1).describe("Font size in pixels"),
    lineHeight: z.number().optional().describe("Line height in pixels"),
    letterSpacing: z.number().optional().describe("Letter spacing in pixels"),
  })
  .strict();

export const createEffectStyleActionSchema = z
  .object({
    type: z.literal("create_effect_style"),
    name: z.string().min(1).describe("Style name (use '/' for folders)"),
    effects: z.array(
      z.object({
        type: z.enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]),
        visible: z.boolean().default(true),
        radius: z.number().min(0).default(0),
        color: z
          .object({
            r: z.number().min(0).max(1),
            g: z.number().min(0).max(1),
            b: z.number().min(0).max(1),
            a: z.number().min(0).max(1).default(1),
          })
          .optional(),
        offset: z
          .object({
            x: z.number().default(0),
            y: z.number().default(0),
          })
          .optional(),
        spread: z.number().optional(),
      })
    ),
  })
  .strict();

// ─── Union of all actions ────────────────────────────────────────────

export const actionSchema = z.discriminatedUnion("type", [
  renameActionSchema,
  moveActionSchema,
  createFrameActionSchema,
  deleteNodeActionSchema,
  setLayoutModeActionSchema,
  setSpacingActionSchema,
  resizeActionSchema,
  createComponentFromNodeActionSchema,
  createComponentSetActionSchema,
  createInstanceActionSchema,
  swapInstanceActionSchema,
  setFillsActionSchema,
  setTextContentActionSchema,
  setTextStyleActionSchema,
  setCornerRadiusActionSchema,
  exportNodeActionSchema,
  setPositionActionSchema,
  setLayoutPositioningActionSchema,
  setVisibleActionSchema,
  setOpacityActionSchema,
  setStrokesActionSchema,
  setEffectsActionSchema,
  setAlignmentActionSchema,
  duplicateNodeActionSchema,
  setComponentPropertiesActionSchema,
  getLocalStylesActionSchema,
  createPaintStyleActionSchema,
  createTextStyleActionSchema,
  createEffectStyleActionSchema,
]);

export type Action = z.infer<typeof actionSchema>;
export type ActionType = Action["type"];

// ─── Batch schema (sent to plugin) ──────────────────────────────────

export const batchPayloadSchema = z.object({
  requestId: z.string(),
  dryRun: z.boolean().default(true),
  stopOnError: z.boolean().default(false),
  actions: z.array(actionSchema),
});

export type BatchPayload = z.infer<typeof batchPayloadSchema>;

// ─── Inverse action computation ─────────────────────────────────────

/**
 * Compute the inverse of an action (for rollback).
 * Returns null if the action is not reversible.
 */
export function computeInverse(
  action: Action,
  result: { before?: unknown; after?: unknown }
): Action | null {
  switch (action.type) {
    case "rename":
      if (typeof result.before === "string") {
        return { type: "rename", nodeId: action.nodeId, name: result.before };
      }
      return null;

    case "move":
      if (
        result.before &&
        typeof result.before === "object" &&
        "parentId" in result.before &&
        "index" in result.before
      ) {
        const prev = result.before as { parentId: string; index: number };
        return {
          type: "move",
          nodeId: action.nodeId,
          targetParentId: prev.parentId,
          insertIndex: prev.index,
        };
      }
      return null;

    case "set_layout_mode":
      if (typeof result.before === "string") {
        return {
          type: "set_layout_mode",
          nodeId: action.nodeId,
          mode: result.before as "HORIZONTAL" | "VERTICAL" | "NONE",
        };
      }
      return null;

    case "set_spacing":
      if (result.before && typeof result.before === "object") {
        return {
          type: "set_spacing",
          nodeId: action.nodeId,
          ...(result.before as Record<string, number>),
        };
      }
      return null;

    case "set_text_content":
      if (typeof result.before === "string") {
        return { type: "set_text_content", nodeId: action.nodeId, characters: result.before };
      }
      return null;

    case "set_corner_radius":
      if (typeof result.before === "number") {
        return { type: "set_corner_radius", nodeId: action.nodeId, radius: result.before };
      }
      return null;

    case "set_position":
      if (result.before && typeof result.before === "object" && "x" in result.before) {
        const prev = result.before as { x: number; y: number };
        return { type: "set_position", nodeId: action.nodeId, x: prev.x, y: prev.y };
      }
      return null;

    case "set_layout_positioning":
      if (typeof result.before === "string") {
        return {
          type: "set_layout_positioning",
          nodeId: action.nodeId,
          positioning: result.before as "AUTO" | "ABSOLUTE",
        };
      }
      return null;

    case "resize":
      if (result.before && typeof result.before === "object" && "width" in result.before) {
        const prev = result.before as { width: number; height: number };
        return { type: "resize", nodeId: action.nodeId, width: prev.width, height: prev.height };
      }
      return null;

    case "set_fills":
      if (result.before && Array.isArray(result.before)) {
        return { type: "set_fills", nodeId: action.nodeId, fills: result.before } as Action;
      }
      return null;

    case "set_text_style":
      // Text style before contains fontSize, fontName, lineHeight, letterSpacing
      // but the shape is complex (FontName object, LineHeight unit object)
      // — only restore fontSize and fontWeight which are simple numbers
      if (result.before && typeof result.before === "object" && "fontSize" in result.before) {
        const prev = result.before as { fontSize?: number; fontName?: { family: string; style: string } };
        return {
          type: "set_text_style",
          nodeId: action.nodeId,
          ...(typeof prev.fontSize === "number" ? { fontSize: prev.fontSize } : {}),
          ...(prev.fontName?.family ? { fontFamily: prev.fontName.family } : {}),
        };
      }
      return null;

    case "set_visible":
      if (typeof result.before === "boolean") {
        return { type: "set_visible", nodeId: action.nodeId, visible: result.before };
      }
      return null;

    case "set_opacity":
      if (typeof result.before === "number") {
        return { type: "set_opacity", nodeId: action.nodeId, opacity: result.before };
      }
      return null;

    case "set_strokes":
      if (result.before && typeof result.before === "object") {
        const prev = result.before as { strokes: unknown[]; strokeWeight?: number };
        return {
          type: "set_strokes",
          nodeId: action.nodeId,
          strokes: prev.strokes,
          ...(prev.strokeWeight !== undefined ? { strokeWeight: prev.strokeWeight } : {}),
        } as Action;
      }
      return null;

    case "set_effects":
      if (result.before && Array.isArray(result.before)) {
        return {
          type: "set_effects",
          nodeId: action.nodeId,
          effects: result.before,
        } as Action;
      }
      return null;

    case "set_alignment":
      if (result.before && typeof result.before === "object") {
        const prev = result.before as { primaryAxisAlignItems?: string; counterAxisAlignItems?: string };
        return {
          type: "set_alignment",
          nodeId: action.nodeId,
          ...(prev.primaryAxisAlignItems ? { primaryAxisAlignItems: prev.primaryAxisAlignItems as "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN" } : {}),
          ...(prev.counterAxisAlignItems ? { counterAxisAlignItems: prev.counterAxisAlignItems as "MIN" | "CENTER" | "MAX" | "BASELINE" } : {}),
        };
      }
      return null;

    case "set_component_properties":
      if (result.before && typeof result.before === "object") {
        return {
          type: "set_component_properties",
          nodeId: action.nodeId,
          properties: result.before as Record<string, string | boolean>,
        };
      }
      return null;

    // These are harder to reverse cleanly
    case "create_frame":
    case "delete_node":
    case "create_component_from_node":
    case "create_component_set":
    case "create_instance":
    case "swap_instance":
    case "export_node":
    case "duplicate_node":
    case "get_local_styles":
    case "create_paint_style":
    case "create_text_style":
    case "create_effect_style":
      return null;

    default:
      return null;
  }
}
