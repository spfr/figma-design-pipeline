import type { FigmaRawNode, FigmaColor, FigmaPaint, DesignToken } from "../shared/types.js";

export interface ExtractedTokens {
  colors: DesignToken[];
  fonts: DesignToken[];
  spacing: DesignToken[];
  radii: DesignToken[];
  shadows: DesignToken[];
  opacities: DesignToken[];
}

/**
 * Extract design tokens from a Figma node tree.
 */
export function extractTokens(
  root: FigmaRawNode,
  types: string[] = ["color", "font", "spacing", "radius", "shadow", "opacity"]
): ExtractedTokens {
  const result: ExtractedTokens = {
    colors: [],
    fonts: [],
    spacing: [],
    radii: [],
    shadows: [],
    opacities: [],
  };

  const seenColors = new Set<string>();
  const seenFonts = new Set<string>();
  const seenSpacing = new Set<number>();
  const seenRadii = new Set<number>();
  const seenOpacities = new Set<number>();

  walkForTokens(root, (node) => {
    // Colors
    if (types.includes("color")) {
      for (const fill of node.fills || []) {
        if (fill.type === "SOLID" && fill.color) {
          const hex = colorToHex(fill.color);
          if (!seenColors.has(hex)) {
            seenColors.add(hex);
            result.colors.push({
              type: "color",
              raw: hex,
              tailwind: mapColorToTailwind(fill.color),
              cssVar: `--color-${hex.slice(1)}`,
            });
          }
        }
      }
    }

    // Fonts
    if (types.includes("font") && node.style) {
      const fontKey = `${node.style.fontFamily || ""}|${node.style.fontSize || ""}|${node.style.fontWeight || ""}`;
      if (fontKey !== "||" && !seenFonts.has(fontKey)) {
        seenFonts.add(fontKey);
        result.fonts.push({
          type: "font",
          raw: fontKey,
          tailwind: mapFontToTailwind(node.style),
          cssVar: undefined,
        });
      }
    }

    // Spacing (from auto-layout or padding)
    if (types.includes("spacing")) {
      for (const val of [
        node.itemSpacing,
        node.paddingTop,
        node.paddingRight,
        node.paddingBottom,
        node.paddingLeft,
      ]) {
        if (val !== undefined && val > 0 && !seenSpacing.has(val)) {
          seenSpacing.add(val);
          result.spacing.push({
            type: "spacing",
            raw: val,
            tailwind: mapSpacingToTailwind(val),
          });
        }
      }
    }

    // Border radius
    if (types.includes("radius")) {
      const r = node.cornerRadius;
      if (r !== undefined && r > 0 && !seenRadii.has(r)) {
        seenRadii.add(r);
        result.radii.push({
          type: "radius",
          raw: r,
          tailwind: mapRadiusToTailwind(r),
        });
      }
    }

    // Shadows
    if (types.includes("shadow")) {
      for (const effect of node.effects || []) {
        if (effect.type === "DROP_SHADOW" && effect.visible) {
          result.shadows.push({
            type: "shadow",
            raw: `${effect.radius || 0}px`,
            tailwind: mapShadowToTailwind(effect.radius || 0),
          });
        }
      }
    }

    // Opacity
    if (types.includes("opacity")) {
      if (node.opacity !== undefined && node.opacity < 1 && !seenOpacities.has(node.opacity)) {
        seenOpacities.add(node.opacity);
        result.opacities.push({
          type: "opacity",
          raw: node.opacity,
          tailwind: `opacity-${Math.round(node.opacity * 100)}`,
        });
      }
    }
  });

  // Sort spacing and radii numerically
  result.spacing.sort((a, b) => (a.raw as number) - (b.raw as number));
  result.radii.sort((a, b) => (a.raw as number) - (b.raw as number));

  return result;
}

/** Extract tokens for a single node (used during enrichment) */
export function extractNodeTokens(node: FigmaRawNode): DesignToken[] {
  const tokens: DesignToken[] = [];

  for (const fill of node.fills || []) {
    if (fill.type === "SOLID" && fill.color) {
      tokens.push({
        type: "color",
        raw: colorToHex(fill.color),
        tailwind: mapColorToTailwind(fill.color),
      });
    }
  }

  if (node.style?.fontSize) {
    tokens.push({
      type: "font",
      raw: `${node.style.fontFamily || "Inter"}/${node.style.fontSize}/${node.style.fontWeight || 400}`,
      tailwind: mapFontToTailwind(node.style),
    });
  }

  if (node.cornerRadius && node.cornerRadius > 0) {
    tokens.push({
      type: "radius",
      raw: node.cornerRadius,
      tailwind: mapRadiusToTailwind(node.cornerRadius),
    });
  }

  return tokens;
}

// ─── Tailwind Mapping Helpers ────────────────────────────────────────

function colorToHex(c: FigmaColor): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function mapColorToTailwind(c: FigmaColor): string {
  const hex = colorToHex(c);

  // Common color mappings
  const colorMap: Record<string, string> = {
    "#000000": "black",
    "#ffffff": "white",
    "#f8fafc": "slate-50",
    "#f1f5f9": "slate-100",
    "#e2e8f0": "slate-200",
    "#cbd5e1": "slate-300",
    "#94a3b8": "slate-400",
    "#64748b": "slate-500",
    "#475569": "slate-600",
    "#334155": "slate-700",
    "#1e293b": "slate-800",
    "#0f172a": "slate-900",
    "#111827": "gray-900",
    "#1f2937": "gray-800",
    "#374151": "gray-700",
    "#6b7280": "gray-500",
    "#9ca3af": "gray-400",
    "#d1d5db": "gray-300",
    "#e5e7eb": "gray-200",
    "#f3f4f6": "gray-100",
    "#f9fafb": "gray-50",
  };

  return colorMap[hex.toLowerCase()] || `[${hex}]`;
}

function mapFontToTailwind(style: {
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
}): string {
  const parts: string[] = [];

  // Font size
  const sizeMap: Record<number, string> = {
    12: "text-xs",
    14: "text-sm",
    16: "text-base",
    18: "text-lg",
    20: "text-xl",
    24: "text-2xl",
    30: "text-3xl",
    36: "text-4xl",
    48: "text-5xl",
    60: "text-6xl",
    72: "text-7xl",
    96: "text-8xl",
  };
  const fontSize = style.fontSize || 16;
  parts.push(sizeMap[fontSize] || `text-[${fontSize}px]`);

  // Font weight
  const weightMap: Record<number, string> = {
    100: "font-thin",
    200: "font-extralight",
    300: "font-light",
    400: "font-normal",
    500: "font-medium",
    600: "font-semibold",
    700: "font-bold",
    800: "font-extrabold",
    900: "font-black",
  };
  if (style.fontWeight && style.fontWeight !== 400) {
    parts.push(weightMap[style.fontWeight] || `font-[${style.fontWeight}]`);
  }

  return parts.join(" ");
}

function mapSpacingToTailwind(px: number): string {
  // Tailwind 4 spacing scale (in px: value * 4)
  const spacingMap: Record<number, string> = {
    0: "0",
    1: "px",
    2: "0.5",
    4: "1",
    6: "1.5",
    8: "2",
    10: "2.5",
    12: "3",
    14: "3.5",
    16: "4",
    20: "5",
    24: "6",
    28: "7",
    32: "8",
    36: "9",
    40: "10",
    44: "11",
    48: "12",
    56: "14",
    64: "16",
    80: "20",
    96: "24",
    112: "28",
    128: "32",
    144: "36",
    160: "40",
  };
  return spacingMap[px] ? `gap-${spacingMap[px]}` : `gap-[${px}px]`;
}

function mapRadiusToTailwind(px: number): string {
  if (px <= 0) return "rounded-none";
  if (px <= 2) return "rounded-sm";
  if (px <= 4) return "rounded";
  if (px <= 6) return "rounded-md";
  if (px <= 8) return "rounded-lg";
  if (px <= 12) return "rounded-xl";
  if (px <= 16) return "rounded-2xl";
  if (px <= 24) return "rounded-3xl";
  if (px >= 9999) return "rounded-full";
  return `rounded-[${px}px]`;
}

function mapShadowToTailwind(radius: number): string {
  if (radius <= 1) return "shadow-sm";
  if (radius <= 3) return "shadow";
  if (radius <= 6) return "shadow-md";
  if (radius <= 10) return "shadow-lg";
  if (radius <= 15) return "shadow-xl";
  return "shadow-2xl";
}

function walkForTokens(node: FigmaRawNode, visit: (n: FigmaRawNode) => void): void {
  visit(node);
  for (const child of node.children || []) walkForTokens(child, visit);
}
