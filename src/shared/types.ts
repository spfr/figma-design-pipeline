import { z } from "zod";

// ─── Figma Node Types ────────────────────────────────────────────────

export const figmaNodeTypeSchema = z.enum([
  "DOCUMENT",
  "CANVAS",
  "FRAME",
  "GROUP",
  "SECTION",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "LINE",
  "ELLIPSE",
  "RECTANGLE",
  "TEXT",
  "SLICE",
  "STICKY",
  "SHAPE_WITH_TEXT",
  "CONNECTOR",
  "TABLE",
  "TABLE_CELL",
  "WIDGET",
]);

export type FigmaNodeType = z.infer<typeof figmaNodeTypeSchema>;

// ─── Raw Figma REST API types ────────────────────────────────────────

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: string;
  color?: FigmaColor;
  opacity?: number;
  gradientStops?: Array<{ position: number; color: FigmaColor }>;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
}

export interface FigmaLayoutConstraints {
  vertical: string;
  horizontal: string;
}

export interface FigmaAbsoluteBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaRawNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaRawNode[];
  absoluteBoundingBox?: FigmaAbsoluteBoundingBox;
  absoluteRenderBounds?: FigmaAbsoluteBoundingBox;
  constraints?: FigmaLayoutConstraints;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  layoutMode?: "HORIZONTAL" | "VERTICAL" | "NONE";
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  characters?: string;
  style?: FigmaTypeStyle;
  componentId?: string;
  opacity?: number;
  effects?: Array<{ type: string; visible: boolean; radius?: number; color?: FigmaColor; offset?: { x: number; y: number }; spread?: number }>;
  clipsContent?: boolean;
  background?: FigmaPaint[];
  backgroundColor?: FigmaColor;
  // Component properties (from REST API)
  componentPropertyDefinitions?: Record<string, {
    type: "BOOLEAN" | "TEXT" | "INSTANCE_SWAP" | "VARIANT";
    defaultValue: unknown;
    variantOptions?: string[];
  }>;
  componentProperties?: Record<string, {
    type: string;
    value: unknown;
  }>;
  // Figma variables bound to properties
  boundVariables?: Record<string, { type: string; id: string }>;
}

// ─── Enriched Node (after analysis) ─────────────────────────────────

export type NodeClassification =
  | "hero"
  | "section"
  | "card"
  | "card-grid"
  | "cta"
  | "nav"
  | "footer"
  | "quote"
  | "metric"
  | "image"
  | "icon"
  | "button"
  | "text-block"
  | "heading"
  | "list"
  | "form"
  | "divider"
  | "badge"
  | "overlay"
  | "container"
  | "unknown";

export interface DesignToken {
  type: "color" | "font" | "spacing" | "radius" | "shadow" | "opacity";
  raw: string | number;
  tailwind?: string;
  cssVar?: string;
}

export interface EnrichedNode {
  id: string;
  name: string;
  type: string;
  classification: NodeClassification;
  depth: number;
  childCount: number;
  bounds?: FigmaAbsoluteBoundingBox;
  tokens: DesignToken[];
  layoutInfo?: {
    mode: "horizontal" | "vertical" | "absolute" | "none";
    spacing?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
  };
  textContent?: string;
  isComponent: boolean;
  isInstance: boolean;
  componentId?: string;
  componentProperties?: Record<string, { type: string; value: unknown }>;
  variantProperties?: Record<string, { type: string; defaultValue: unknown; options?: string[] }>;
  children: EnrichedNode[];
}

// ─── Audit Types ─────────────────────────────────────────────────────

export type AuditCheckCategory =
  | "naming"
  | "structure"
  | "layout"
  | "components"
  | "tokens"
  | "accessibility";

export interface AuditViolation {
  nodeId: string;
  nodeName: string;
  category: AuditCheckCategory;
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
}

export interface AuditResult {
  rootNodeId: string;
  totalNodes: number;
  checksRun: AuditCheckCategory[];
  violations: AuditViolation[];
  summary: Record<AuditCheckCategory, { errors: number; warnings: number; info: number }>;
}

// ─── Component Registry Types ────────────────────────────────────────

export interface FigmaSignature {
  keywords: string[];
  position?: "top" | "middle" | "bottom";
  childPatterns?: string[];
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface ComponentRegistryEntry {
  id: string;
  name: string;
  path: string;
  category: "ui" | "blocks" | "sections" | "templates";
  description: string;
  props: ComponentProp[];
  figmaSignature: FigmaSignature;
  schemaFields?: Record<string, string>;
}

export interface ComponentRegistry {
  version: string;
  project: string;
  components: ComponentRegistryEntry[];
}

// ─── Codegen Types ───────────────────────────────────────────────────

export interface ComponentMapping {
  figmaNodeId: string;
  figmaNodeName: string;
  cmsComponent: string;
  confidence: number;
  propMappings: Record<string, string>;
  hints?: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: "astro" | "typescript" | "json" | "css";
}

// ─── Figma URL field (shared across tools) ──────────────────────────

const figmaUrlField = z
  .string()
  .optional()
  .describe(
    "Figma design URL (e.g., 'https://www.figma.com/design/ABC123/File-Name?node-id=1817:2817'). " +
    "Extracts file key and node ID automatically. Once set, persists for the session."
  );

// ─── Tool Input Schemas (Zod) ────────────────────────────────────────

export const getTreeInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Figma node ID (e.g., '1817:2817'). Auto-extracted from figmaUrl if provided."),
  depth: z.number().int().min(1).max(20).default(10).describe("Max depth to traverse"),
  includeStyles: z.boolean().default(true).describe("Include style/token information"),
});

export const auditInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to audit. Auto-extracted from figmaUrl if provided."),
  checks: z
    .array(z.enum(["naming", "structure", "layout", "components", "tokens", "accessibility"]))
    .default(["naming", "structure", "layout", "components", "tokens", "accessibility"])
    .describe("Which audit checks to run"),
  maxViolations: z.number().int().min(1).max(500).default(100).describe("Max violations to return (default 100). Summary always reflects full counts."),
});

export const extractTokensInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to extract tokens from"),
  tokenTypes: z
    .array(z.enum(["color", "font", "spacing", "radius", "shadow", "opacity"]))
    .default(["color", "font", "spacing", "radius", "shadow", "opacity"])
    .describe("Which token types to extract"),
});

export const planNamingInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to plan naming for"),
  convention: z.enum(["kebab", "slash", "BEM"]).default("slash").describe("Naming convention"),
  overrides: z
    .array(z.object({ nodeId: z.string(), name: z.string() }))
    .default([])
    .describe("Manual name overrides"),
});

export const planGroupingInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to plan grouping for"),
  strategy: z
    .enum(["semantic", "spatial", "minimal"])
    .default("semantic")
    .describe("Grouping strategy"),
});

export const planLayoutInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to plan layout for"),
  scope: z.enum(["all", "top-level", "leaves"]).default("all").describe("Which nodes to convert"),
});

export const planComponentsInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to plan components for"),
  minSimilarity: z.number().min(0).max(1).default(0.8).describe("Min structural similarity"),
  minOccurrences: z.number().int().min(2).default(2).describe("Min repetitions to extract"),
});

export const mapComponentsInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to map"),
  registry: z.string().default("default").describe("Component registry to use"),
  hints: z
    .array(z.object({ nodeId: z.string(), component: z.string() }))
    .default([])
    .describe("Manual component hints"),
});

export const generatePageInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to generate page from"),
  registry: z.string().default("default").describe("Component registry to use"),
  templateType: z
    .enum(["case-study", "blog-post", "landing", "generic"])
    .default("generic")
    .describe("Template type to generate"),
});

export const generateSchemaInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to generate schema from"),
  schemaId: z.string().describe("Schema ID (e.g., 'case-studies')"),
});

export const exportTokensInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to export tokens from. Auto-extracted from figmaUrl if provided."),
  format: z
    .enum(["tailwind", "css", "json"])
    .default("tailwind")
    .describe("Export format for tokens"),
});

export const exportImagesInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeIds: z.array(z.string()).min(1).describe("Node IDs to export as images"),
  format: z.enum(["png", "svg", "jpg", "pdf"]).default("png").describe("Image format"),
  scale: z.number().min(0.5).max(4).default(2).describe("Export scale (0.5x to 4x)"),
});

export const findNodesInputSchema = z.object({
  figmaUrl: figmaUrlField,
  nodeId: z.string().optional().describe("Root node ID to search within. Auto-extracted from figmaUrl if provided."),
  namePattern: z.string().optional().describe("Regex pattern to match node names (case-insensitive)"),
  type: z.string().optional().describe("Figma node type filter (e.g., 'FRAME', 'INSTANCE', 'TEXT', 'COMPONENT')"),
  classification: z
    .enum([
      "hero", "section", "card", "card-grid", "cta", "nav", "footer", "quote",
      "metric", "image", "icon", "button", "text-block", "heading", "list",
      "form", "divider", "badge", "overlay", "container", "unknown",
    ])
    .optional()
    .describe("Filter by node classification"),
  textContent: z.string().optional().describe("Regex pattern to match text content (case-insensitive)"),
  componentId: z.string().optional().describe("Filter instances by component ID"),
  hasChildren: z.boolean().optional().describe("Filter nodes with/without children"),
  minWidth: z.number().optional().describe("Minimum node width in pixels"),
  maxWidth: z.number().optional().describe("Maximum node width in pixels"),
  minHeight: z.number().optional().describe("Minimum node height in pixels"),
  maxHeight: z.number().optional().describe("Maximum node height in pixels"),
  limit: z.number().int().min(1).max(200).default(50).describe("Max results to return"),
});

export const getComponentsInputSchema = z.object({
  figmaUrl: figmaUrlField,
});

export const getStylesInputSchema = z.object({
  figmaUrl: figmaUrlField,
});

// ─── Token Comparison Schemas ───────────────────────────────────────

const colorTokenSchema = z.object({
  name: z.string().describe("Style name (use '/' for folders, e.g. 'Brand/Primary')"),
  hex: z.string().regex(/^#[0-9A-Fa-f]{3,8}$/).describe("Hex color value (#RGB, #RRGGBB, or #RRGGBBAA)"),
});

const fontTokenSchema = z.object({
  name: z.string().describe("Style name (use '/' for folders)"),
  fontFamily: z.string(),
  fontWeight: z.number().min(100).max(900).default(400),
  fontSize: z.number().min(1),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
});

const effectTokenSchema = z.object({
  name: z.string().describe("Style name (use '/' for folders)"),
  effects: z.array(
    z.object({
      type: z.enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]),
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
});

const figmaStyleDataSchema = z.object({
  paintStyles: z.array(z.object({
    name: z.string(),
    paints: z.array(z.object({
      type: z.string(),
      color: z.object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() }).optional(),
      opacity: z.number().optional(),
    })),
  })).optional(),
  textStyles: z.array(z.object({
    name: z.string(),
    fontFamily: z.string(),
    fontWeight: z.number(),
    fontSize: z.number(),
    lineHeight: z.object({ value: z.number(), unit: z.string() }).optional(),
    letterSpacing: z.object({ value: z.number(), unit: z.string() }).optional(),
  })).optional(),
  effectStyles: z.array(z.object({
    name: z.string(),
    effects: z.array(z.object({
      type: z.string(),
      radius: z.number(),
      color: z.object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() }).optional(),
      offset: z.object({ x: z.number(), y: z.number() }).optional(),
      spread: z.number().optional(),
    })),
  })).optional(),
}).describe("Figma style data from the official Figma MCP (use_figma) or REST API (figma_get_styles)");

export const diffTokensInputSchema = z.object({
  figmaUrl: figmaUrlField,
  colors: z.array(colorTokenSchema).default([]).describe("Color tokens from your code to compare"),
  fonts: z.array(fontTokenSchema).default([]).describe("Typography tokens from your code to compare"),
  effects: z.array(effectTokenSchema).default([]).describe("Effect tokens from your code to compare"),
  figmaStyles: figmaStyleDataSchema.describe("Figma style data to compare against. Get this from the official Figma MCP or REST API."),
});
