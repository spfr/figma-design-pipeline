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

