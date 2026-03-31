import type { ToolContext } from "../../shared/context.js";
import type { GeneratedFile } from "../../shared/types.js";
import { handleExtractTokens } from "../inspect/extract-tokens.js";

interface ExportTokensParams {
  figmaUrl?: string;
  nodeId?: string;
  format?: "tailwind" | "css" | "json" | "style-dictionary";
}

export async function handleExportTokens(
  ctx: ToolContext,
  params: ExportTokensParams
): Promise<{
  format: string;
  file: GeneratedFile;
}> {
  const { format = "tailwind", nodeId } = params;

  if (!nodeId) {
    throw new Error("nodeId is required. Pass a Figma URL or nodeId directly.");
  }

  const { tokens } = await handleExtractTokens(ctx, { nodeId });

  let file: GeneratedFile;

  switch (format) {
    case "tailwind":
      file = emitTailwindConfig(tokens);
      break;
    case "css":
      file = emitCssVariables(tokens);
      break;
    case "json":
      file = {
        path: "design-tokens.json",
        content: JSON.stringify(tokens, null, 2),
        type: "json",
      };
      break;
    case "style-dictionary":
      file = emitStyleDictionary(tokens);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  return { format, file };
}

// ─── Color helpers ──────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace("#", "");
  if (cleaned.length < 6) return null;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hexLightness(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  return rgbToHsl(rgb.r, rgb.g, rgb.b).l;
}

function hexHue(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return rgbToHsl(rgb.r, rgb.g, rgb.b).h;
}

function hexSaturation(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return rgbToHsl(rgb.r, rgb.g, rgb.b).s;
}

function hueBucketName(hue: number, saturation: number): string {
  if (saturation < 0.08) return "gray";
  if (hue < 15) return "red";
  if (hue < 40) return "orange";
  if (hue < 65) return "yellow";
  if (hue < 160) return "green";
  if (hue < 200) return "cyan";
  if (hue < 260) return "blue";
  if (hue < 300) return "purple";
  if (hue < 340) return "pink";
  return "red";
}

function groupColorsByHue(colors: Array<{ raw: string | number }>): Record<string, string> {
  const buckets: Record<string, Array<{ hex: string; lightness: number }>> = {};
  for (const token of colors) {
    const hex = String(token.raw);
    if (!hex.startsWith("#")) continue;
    const name = hueBucketName(hexHue(hex), hexSaturation(hex));
    if (!buckets[name]) buckets[name] = [];
    buckets[name].push({ hex, lightness: hexLightness(hex) });
  }

  const result: Record<string, string> = {};
  for (const [bucket, shades] of Object.entries(buckets)) {
    shades.sort((a, b) => b.lightness - a.lightness);
    if (shades.length === 1) {
      result[bucket] = shades[0].hex;
    } else {
      const scale = generateScale(shades.length);
      for (let i = 0; i < shades.length; i++) {
        result[`${bucket}-${scale[i]}`] = shades[i].hex;
      }
    }
  }
  return result;
}

function generateScale(n: number): number[] {
  if (n === 1) return [500];
  if (n === 2) return [300, 700];
  const full = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  if (n >= full.length) return full.slice(0, n);
  const step = (full.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => full[Math.round(i * step)]);
}

// ─── Font helpers ───────────────────────────────────────────────────

function parseFontFamily(raw: string | number): string {
  return String(raw).split("|")[0] || String(raw);
}

function classifyFont(family: string): "sans" | "serif" | "mono" {
  const lower = family.toLowerCase();
  if (/mono|courier|consolas|fira\s*code|jetbrains|menlo|source\s*code/i.test(lower)) return "mono";
  if (/serif|georgia|times|garamond|palatino|baskerville/i.test(lower)) {
    if (/sans[-\s]?serif/i.test(lower)) return "sans";
    return "serif";
  }
  return "sans";
}

// ─── Tailwind config emitter ────────────────────────────────────────

function emitTailwindConfig(tokens: {
  colors: Array<{ raw: string | number; tailwind?: string }>;
  fonts: Array<{ raw: string | number }>;
  spacing: Array<{ raw: string | number }>;
  radii: Array<{ raw: string | number }>;
  shadows?: Array<{ raw: string | number }>;
}): GeneratedFile {
  const colors = groupColorsByHue(tokens.colors);

  const spacing: Record<string, string> = {};
  for (const px of [...tokens.spacing].map(t => Number(t.raw)).filter(n => !isNaN(n)).sort((a, b) => a - b)) {
    spacing[String(px)] = `${px}px`;
  }

  const fontFamily: Record<string, string[]> = {};
  const seenFamilies = new Set<string>();
  for (const token of tokens.fonts) {
    const family = parseFontFamily(token.raw);
    if (seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    const cls = classifyFont(family);
    if (!fontFamily[cls]) fontFamily[cls] = [];
    fontFamily[cls].push(family);
  }

  const borderRadius: Record<string, string> = {};
  const radiusLabels = ["sm", "DEFAULT", "md", "lg", "xl", "2xl", "3xl", "full"];
  const radiiSorted = [...tokens.radii].map(t => Number(t.raw)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  for (let i = 0; i < radiiSorted.length; i++) {
    borderRadius[i < radiusLabels.length ? radiusLabels[i] : `${i + 1}`] = `${radiiSorted[i]}px`;
  }

  const boxShadow: Record<string, string> = {};
  if (tokens.shadows && tokens.shadows.length > 0) {
    const labels = ["sm", "DEFAULT", "md", "lg", "xl", "2xl"];
    for (let i = 0; i < tokens.shadows.length; i++) {
      boxShadow[i < labels.length ? labels[i] : `${i + 1}`] = String(tokens.shadows[i].raw);
    }
  }

  const config: Record<string, unknown> = { colors, spacing, fontFamily, borderRadius };
  if (Object.keys(boxShadow).length > 0) config.boxShadow = boxShadow;

  const content = `// Auto-generated from Figma design tokens
// Add these to your tailwind.config.ts extend section

export const figmaTokens = ${JSON.stringify(config, null, 2)};
`;

  return { path: "figma-tokens.ts", content, type: "typescript" };
}

// ─── CSS variables emitter ──────────────────────────────────────────

function emitCssVariables(tokens: {
  colors: Array<{ raw: string | number }>;
  fonts: Array<{ raw: string | number }>;
  spacing: Array<{ raw: string | number }>;
  radii: Array<{ raw: string | number }>;
}): GeneratedFile {
  const lines: string[] = ["/* Auto-generated from Figma design tokens */", ":root {"];

  // Colors ordered by lightness
  const colorEntries = tokens.colors
    .map(t => ({ hex: String(t.raw), lightness: hexLightness(String(t.raw)) }))
    .filter(c => c.hex.startsWith("#"))
    .sort((a, b) => a.lightness - b.lightness);
  lines.push("  /* Colors (dark to light) */");
  for (let i = 0; i < colorEntries.length; i++) {
    lines.push(`  --color-${i + 1}: ${colorEntries[i].hex};`);
  }

  // Fonts
  const fontsByClass: Record<string, string[]> = {};
  const seenFamilies = new Set<string>();
  for (const token of tokens.fonts) {
    const family = parseFontFamily(token.raw);
    if (seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    const cls = classifyFont(family);
    if (!fontsByClass[cls]) fontsByClass[cls] = [];
    fontsByClass[cls].push(family);
  }
  if (Object.keys(fontsByClass).length > 0) {
    lines.push("", "  /* Fonts */");
    for (const [cls, families] of Object.entries(fontsByClass)) {
      lines.push(`  --font-${cls}: ${families.map(f => f.includes(" ") ? `"${f}"` : f).join(", ")};`);
    }
  }

  // Spacing
  const spacingVals = [...tokens.spacing].map(t => Number(t.raw)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (spacingVals.length > 0) {
    lines.push("", "  /* Spacing */");
    for (let i = 0; i < spacingVals.length; i++) lines.push(`  --spacing-${i + 1}: ${spacingVals[i]}px;`);
  }

  // Radii
  const radiiVals = [...tokens.radii].map(t => Number(t.raw)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (radiiVals.length > 0) {
    lines.push("", "  /* Border radius */");
    for (let i = 0; i < radiiVals.length; i++) lines.push(`  --radius-${i + 1}: ${radiiVals[i]}px;`);
  }

  lines.push("}");
  return { path: "figma-tokens.css", content: lines.join("\n"), type: "css" };
}

// ─── Style Dictionary (W3C DTCG) emitter ────────────────────────────

function emitStyleDictionary(tokens: {
  colors: Array<{ raw: string | number }>;
  fonts: Array<{ raw: string | number }>;
  spacing: Array<{ raw: string | number }>;
  radii: Array<{ raw: string | number }>;
  shadows: Array<{ raw: string | number }>;
  opacities: Array<{ raw: string | number }>;
}): GeneratedFile {
  const output: Record<string, Record<string, { $value: string; $type: string }>> = {};

  const colorEntries = tokens.colors
    .map(t => ({ hex: String(t.raw), lightness: hexLightness(String(t.raw)) }))
    .filter(c => c.hex.startsWith("#"))
    .sort((a, b) => a.lightness - b.lightness);
  if (colorEntries.length > 0) {
    output.color = {};
    for (let i = 0; i < colorEntries.length; i++) {
      output.color[String(i + 1)] = { $value: colorEntries[i].hex, $type: "color" };
    }
  }

  const spacingVals = [...tokens.spacing].map(t => Number(t.raw)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (spacingVals.length > 0) {
    output.spacing = {};
    for (let i = 0; i < spacingVals.length; i++) {
      output.spacing[String(i + 1)] = { $value: `${spacingVals[i]}px`, $type: "dimension" };
    }
  }

  const radiiVals = [...tokens.radii].map(t => Number(t.raw)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (radiiVals.length > 0) {
    output.borderRadius = {};
    for (let i = 0; i < radiiVals.length; i++) {
      output.borderRadius[String(i + 1)] = { $value: `${radiiVals[i]}px`, $type: "dimension" };
    }
  }

  const seenFamilies = new Set<string>();
  const fontList: string[] = [];
  for (const token of tokens.fonts) {
    const family = parseFontFamily(token.raw);
    if (seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    fontList.push(family);
  }
  if (fontList.length > 0) {
    output.fontFamily = {};
    for (let i = 0; i < fontList.length; i++) {
      output.fontFamily[String(i + 1)] = { $value: fontList[i], $type: "fontFamily" };
    }
  }

  if (tokens.shadows.length > 0) {
    output.shadow = {};
    for (let i = 0; i < tokens.shadows.length; i++) {
      output.shadow[String(i + 1)] = { $value: String(tokens.shadows[i].raw), $type: "shadow" };
    }
  }

  return { path: "design-tokens.json", content: JSON.stringify(output, null, 2), type: "json" };
}
