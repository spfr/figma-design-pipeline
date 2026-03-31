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

export const createTextActionSchema = z
  .object({
    type: z.literal("create_text"),
    parentId: z.string(),
    characters: z.string(),
    name: z.string().optional(),
    fontFamily: z.string().default("Inter"),
    fontWeight: z.number().default(400),
    fontSize: z.number().min(1).optional(),
    lineHeight: z.number().optional(),
    letterSpacing: z.number().optional(),
    fills: z.array(z.object({
      type: z.enum(["SOLID"]),
      color: z.object({
        r: z.number().min(0).max(1),
        g: z.number().min(0).max(1),
        b: z.number().min(0).max(1),
        a: z.number().min(0).max(1).default(1),
      }).optional(),
      opacity: z.number().min(0).max(1).optional(),
    })).optional(),
    textCase: z.enum(["ORIGINAL", "UPPER", "LOWER", "TITLE"]).optional(),
    textAlignHorizontal: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional(),
    textAutoResize: z.enum(["NONE", "WIDTH_AND_HEIGHT", "HEIGHT", "TRUNCATE"]).optional(),
    layoutSizingHorizontal: z.enum(["FILL", "HUG", "FIXED"]).optional(),
    layoutSizingVertical: z.enum(["FILL", "HUG", "FIXED"]).optional(),
    opacity: z.number().min(0).max(1).optional(),
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
        type: z.enum(["SOLID"]),
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

// ─── Responsive Layout Actions ──────────────────────────────────────

export const setChildLayoutSizingActionSchema = z
  .object({
    type: z.literal("set_child_layout_sizing"),
    nodeId: z.string().describe("Child node inside an auto-layout parent"),
    layoutSizingHorizontal: z.enum(["FILL", "HUG", "FIXED"]).optional(),
    layoutSizingVertical: z.enum(["FILL", "HUG", "FIXED"]).optional(),
  })
  .strict();

export const setConstraintsActionSchema = z
  .object({
    type: z.literal("set_constraints"),
    nodeId: z.string(),
    horizontal: z.enum(["MIN", "CENTER", "MAX", "STRETCH", "SCALE"]).optional(),
    vertical: z.enum(["MIN", "CENTER", "MAX", "STRETCH", "SCALE"]).optional(),
  })
  .strict();

export const setMinMaxSizeActionSchema = z
  .object({
    type: z.literal("set_min_max_size"),
    nodeId: z.string(),
    minWidth: z.number().min(0).optional(),
    maxWidth: z.number().min(0).optional(),
    minHeight: z.number().min(0).optional(),
    maxHeight: z.number().min(0).optional(),
  })
  .strict();

// ─── Page Management Actions ────────────────────────────────────────

export const createPageActionSchema = z
  .object({
    type: z.literal("create_page"),
    name: z.string().min(1),
  })
  .strict();

export const switchPageActionSchema = z
  .object({
    type: z.literal("switch_page"),
    pageId: z.string().describe("Page node ID to switch to"),
  })
  .strict();

// ─── Rich Content Actions ───────────────────────────────────────────

export const setGradientFillActionSchema = z
  .object({
    type: z.literal("set_gradient_fill"),
    nodeId: z.string(),
    gradientType: z.enum(["LINEAR", "RADIAL", "ANGULAR"]).default("LINEAR"),
    stops: z.array(z.object({
      position: z.number().min(0).max(1),
      color: z.object({
        r: z.number().min(0).max(1),
        g: z.number().min(0).max(1),
        b: z.number().min(0).max(1),
        a: z.number().min(0).max(1).default(1),
      }),
    })).min(2),
    angle: z.number().optional().describe("Angle in degrees for linear gradients (0 = top to bottom)"),
  })
  .strict();

export const setImageFillActionSchema = z
  .object({
    type: z.literal("set_image_fill"),
    nodeId: z.string(),
    imageBase64: z.string().describe("Base64-encoded image data"),
    scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).default("FILL"),
  })
  .strict();

// ─── Text Enhancement Actions ───────────────────────────────────────

export const setTextPropertiesActionSchema = z
  .object({
    type: z.literal("set_text_properties"),
    nodeId: z.string(),
    textAlignHorizontal: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional(),
    textAlignVertical: z.enum(["TOP", "CENTER", "BOTTOM"]).optional(),
    paragraphSpacing: z.number().min(0).optional(),
    textCase: z.enum(["ORIGINAL", "UPPER", "LOWER", "TITLE"]).optional(),
    textDecoration: z.enum(["NONE", "UNDERLINE", "STRIKETHROUGH"]).optional(),
    textAutoResize: z.enum(["NONE", "WIDTH_AND_HEIGHT", "HEIGHT", "TRUNCATE"]).optional(),
  })
  .strict();

// ─── Style Binding Actions ──────────────────────────────────────────

export const applyStyleActionSchema = z
  .object({
    type: z.literal("apply_style"),
    nodeId: z.string(),
    styleId: z.string().describe("Paint/text/effect style ID"),
    property: z.enum(["fill", "stroke", "text", "effect"]),
  })
  .strict();

export const setDescriptionActionSchema = z
  .object({
    type: z.literal("set_description"),
    nodeId: z.string(),
    description: z.string(),
  })
  .strict();

// ─── Component Property Definition ──────────────────────────────────

export const defineComponentPropertyActionSchema = z
  .object({
    type: z.literal("define_component_property"),
    nodeId: z.string().describe("Master component ID"),
    propertyName: z.string(),
    propertyType: z.enum(["TEXT", "BOOLEAN", "INSTANCE_SWAP", "VARIANT"]),
    defaultValue: z.union([z.string(), z.boolean()]),
  })
  .strict();

// ─── Figma Variables Actions ────────────────────────────────────────

export const createVariableCollectionActionSchema = z
  .object({
    type: z.literal("create_variable_collection"),
    name: z.string().min(1),
    modes: z.array(z.string()).default(["Default"]).describe("Mode names (e.g., ['Light', 'Dark'])"),
  })
  .strict();

export const createVariableActionSchema = z
  .object({
    type: z.literal("create_variable"),
    collectionId: z.string().describe("Variable collection ID (use $ref: for recently created)"),
    name: z.string().min(1).describe("Variable name (use '/' for folders, e.g., 'color/brand/primary')"),
    resolvedType: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]),
    value: z.unknown().describe("Value matching the type: hex string for COLOR, number for FLOAT, etc."),
    scopes: z.array(z.string()).optional().describe("Scope list, e.g., ['FRAME_FILL', 'SHAPE_FILL'] — defaults to ALL_SCOPES if omitted"),
  })
  .strict();

export const bindVariableActionSchema = z
  .object({
    type: z.literal("bind_variable"),
    nodeId: z.string(),
    property: z.enum([
      "fills", "strokes",
      "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
      "itemSpacing", "cornerRadius", "opacity",
      "width", "height",
    ]),
    variableId: z.string().describe("Variable ID to bind (use $ref: for recently created)"),
    paintIndex: z.number().int().min(0).optional().describe("For fills/strokes: which paint in the array to bind (default 0)"),
  })
  .strict();

// ─── Union of all actions ────────────────────────────────────────────

export const actionSchema = z.discriminatedUnion("type", [
  // Core scene graph
  renameActionSchema,
  moveActionSchema,
  createFrameActionSchema,
  createTextActionSchema,
  deleteNodeActionSchema,
  resizeActionSchema,
  setPositionActionSchema,
  duplicateNodeActionSchema,
  setVisibleActionSchema,
  setOpacityActionSchema,
  // Layout
  setLayoutModeActionSchema,
  setLayoutPositioningActionSchema,
  setAlignmentActionSchema,
  setSpacingActionSchema,
  setChildLayoutSizingActionSchema,
  setConstraintsActionSchema,
  setMinMaxSizeActionSchema,
  // Appearance
  setFillsActionSchema,
  setGradientFillActionSchema,
  setImageFillActionSchema,
  setStrokesActionSchema,
  setEffectsActionSchema,
  setCornerRadiusActionSchema,
  // Text
  setTextContentActionSchema,
  setTextStyleActionSchema,
  setTextPropertiesActionSchema,
  // Components
  createComponentFromNodeActionSchema,
  createComponentSetActionSchema,
  createInstanceActionSchema,
  swapInstanceActionSchema,
  setComponentPropertiesActionSchema,
  defineComponentPropertyActionSchema,
  // Styles
  createPaintStyleActionSchema,
  createTextStyleActionSchema,
  createEffectStyleActionSchema,
  applyStyleActionSchema,
  setDescriptionActionSchema,
  // Pages
  createPageActionSchema,
  switchPageActionSchema,
  // Variables (design tokens)
  createVariableCollectionActionSchema,
  createVariableActionSchema,
  bindVariableActionSchema,
  // Export
  exportNodeActionSchema,
]);

export type Action = z.infer<typeof actionSchema>;
export type ActionType = Action["type"];

