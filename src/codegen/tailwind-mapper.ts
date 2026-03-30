import type { FigmaColor, FigmaAbsoluteBoundingBox } from "../shared/types.js";

/**
 * Map Figma spacing values to Tailwind classes.
 */
export function spacingToTw(px: number, prefix: string = "gap"): string {
  const scale: Record<number, string> = {
    0: "0",
    1: "px",
    2: "0.5",
    4: "1",
    6: "1.5",
    8: "2",
    10: "2.5",
    12: "3",
    16: "4",
    20: "5",
    24: "6",
    32: "8",
    40: "10",
    48: "12",
    56: "14",
    64: "16",
    80: "20",
    96: "24",
  };
  const val = scale[px];
  return val ? `${prefix}-${val}` : `${prefix}-[${px}px]`;
}

/**
 * Map Figma padding to Tailwind padding classes.
 */
export function paddingToTw(padding: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}): string {
  const { top, right, bottom, left } = padding;

  // All same
  if (top === right && right === bottom && bottom === left) {
    return spacingToTw(top, "p");
  }

  // Symmetric
  if (top === bottom && left === right) {
    return `${spacingToTw(top, "py")} ${spacingToTw(left, "px")}`;
  }

  // Individual
  const parts: string[] = [];
  if (top) parts.push(spacingToTw(top, "pt" as "p"));
  if (right) parts.push(spacingToTw(right, "pr" as "p"));
  if (bottom) parts.push(spacingToTw(bottom, "pb" as "p"));
  if (left) parts.push(spacingToTw(left, "pl" as "p"));
  return parts.join(" ");
}

/**
 * Map Figma font size to Tailwind text size.
 */
export function fontSizeToTw(px: number): string {
  const map: Record<number, string> = {
    10: "text-[10px]",
    11: "text-[11px]",
    12: "text-xs",
    14: "text-sm",
    16: "text-base",
    18: "text-lg",
    20: "text-xl",
    24: "text-2xl",
    30: "text-3xl",
    36: "text-4xl",
    42: "text-[42px]",
    48: "text-5xl",
    60: "text-6xl",
    64: "text-[64px]",
    72: "text-7xl",
    96: "text-8xl",
  };
  return map[px] || `text-[${px}px]`;
}

/**
 * Map Figma font weight to Tailwind.
 */
export function fontWeightToTw(weight: number): string {
  const map: Record<number, string> = {
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
  return map[weight] || `font-[${weight}]`;
}

/**
 * Map Figma color to Tailwind color class.
 */
export function colorToTw(color: FigmaColor, prefix: "text" | "bg" | "border" = "text"): string {
  const hex = `#${Math.round(color.r * 255)
    .toString(16)
    .padStart(2, "0")}${Math.round(color.g * 255)
    .toString(16)
    .padStart(2, "0")}${Math.round(color.b * 255)
    .toString(16)
    .padStart(2, "0")}`;

  const knownColors: Record<string, string> = {
    "#000000": "black",
    "#ffffff": "white",
    "#111827": "gray-900",
    "#1f2937": "gray-800",
    "#374151": "gray-700",
    "#6b7280": "gray-500",
    "#9ca3af": "gray-400",
    "#d1d5db": "gray-300",
    "#f3f4f6": "gray-100",
    "#f9fafb": "gray-50",
  };

  const tw = knownColors[hex.toLowerCase()];
  if (tw) return `${prefix}-${tw}`;
  return `${prefix}-[${hex}]`;
}

/**
 * Map Figma border radius to Tailwind.
 */
export function radiusToTw(px: number): string {
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

/**
 * Infer responsive grid from child bounds.
 */
export function inferGridClasses(
  childBounds: FigmaAbsoluteBoundingBox[],
  parentWidth: number
): string {
  if (childBounds.length <= 1) return "";

  // Count how many columns based on x-position clustering
  const xPositions = [...new Set(childBounds.map((b) => Math.round(b.x / 10) * 10))].sort(
    (a, b) => a - b
  );
  const cols = xPositions.length;

  if (cols === 1) return "grid grid-cols-1";
  if (cols === 2) return "grid grid-cols-1 lg:grid-cols-2";
  if (cols === 3) return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  if (cols === 4) return "grid grid-cols-2 lg:grid-cols-4";
  return `grid grid-cols-2 lg:grid-cols-${cols}`;
}
