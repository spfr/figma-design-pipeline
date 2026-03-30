import type { FigmaColor } from "./types.js";

const COLOR_TOLERANCE = 1 / 255;

/** Convert Figma RGBA (0-1) to hex string. Includes alpha only if < 1. */
export function rgbaToHex(c: FigmaColor): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(c.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(c.b * 255).toString(16).padStart(2, "0");
  if (c.a < 1) {
    const a = Math.round(c.a * 255).toString(16).padStart(2, "0");
    return `#${r}${g}${b}${a}`;
  }
  return `#${r}${g}${b}`;
}

/** Convert hex string to Figma RGBA (0-1). Supports #RGB, #RRGGBB, #RRGGBBAA. */
export function hexToRgba(hex: string): FigmaColor {
  const clean = hex.replace("#", "");
  let r: number, g: number, b: number, a = 1;

  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255;
    g = parseInt(clean[1] + clean[1], 16) / 255;
    b = parseInt(clean[2] + clean[2], 16) / 255;
  } else if (clean.length === 6) {
    r = parseInt(clean.substring(0, 2), 16) / 255;
    g = parseInt(clean.substring(2, 4), 16) / 255;
    b = parseInt(clean.substring(4, 6), 16) / 255;
  } else if (clean.length === 8) {
    r = parseInt(clean.substring(0, 2), 16) / 255;
    g = parseInt(clean.substring(2, 4), 16) / 255;
    b = parseInt(clean.substring(4, 6), 16) / 255;
    a = parseInt(clean.substring(6, 8), 16) / 255;
  } else {
    throw new Error(`Invalid hex color: "${hex}". Expected #RGB, #RRGGBB, or #RRGGBBAA.`);
  }

  return { r, g, b, a };
}

/** Compute relative luminance per WCAG 2.1 (0 = black, 1 = white). */
export function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Check if two RGBA colors are close enough to be considered equal (±1/255). */
export function colorsClose(a: FigmaColor, b: FigmaColor): boolean {
  return (
    Math.abs(a.r - b.r) <= COLOR_TOLERANCE &&
    Math.abs(a.g - b.g) <= COLOR_TOLERANCE &&
    Math.abs(a.b - b.b) <= COLOR_TOLERANCE &&
    Math.abs(a.a - b.a) <= COLOR_TOLERANCE
  );
}
