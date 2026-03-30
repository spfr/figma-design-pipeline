import { hexToRgba, rgbaToHex, colorsClose } from "../../shared/color.js";
import type { FigmaColor } from "../../shared/types.js";

// ─── Input types ─────────────────────────────────────────────────────

interface ColorToken {
  name: string;
  hex: string;
}

interface FontToken {
  name: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
}

interface EffectToken {
  name: string;
  effects: Array<{
    type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
    radius?: number;
    color?: FigmaColor;
    offset?: { x: number; y: number };
    spread?: number;
  }>;
}

/** Style data from Figma (provided by caller — e.g., from official Figma MCP or REST API) */
interface FigmaPaintStyleEntry {
  name: string;
  paints: Array<{ type: string; color?: FigmaColor; opacity?: number }>;
}

interface FigmaTextStyleEntry {
  name: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight?: { value: number; unit: string };
  letterSpacing?: { value: number; unit: string };
}

interface FigmaEffectStyleEntry {
  name: string;
  effects: Array<{
    type: string;
    radius: number;
    color?: FigmaColor;
    offset?: { x: number; y: number };
    spread?: number;
  }>;
}

interface FigmaStyleData {
  paintStyles?: FigmaPaintStyleEntry[];
  textStyles?: FigmaTextStyleEntry[];
  effectStyles?: FigmaEffectStyleEntry[];
}

interface DiffTokensParams {
  colors?: ColorToken[];
  fonts?: FontToken[];
  effects?: EffectToken[];
  figmaStyles?: FigmaStyleData;
}

// ─── Result types ────────────────────────────────────────────────────

interface DiffEntry {
  name: string;
  type: "paint" | "text" | "effect";
  differences?: string[];
}

interface DiffTokensResult {
  figmaOnly: DiffEntry[];
  codeOnly: DiffEntry[];
  changed: DiffEntry[];
  matched: DiffEntry[];
  summary: {
    figmaOnly: number;
    codeOnly: number;
    changed: number;
    matched: number;
  };
}

// ─── Diff logic ──────────────────────────────────────────────────────

function diffColor(
  token: ColorToken,
  figmaStyle: FigmaPaintStyleEntry
): string[] | null {
  const expected = hexToRgba(token.hex);
  const firstPaint = figmaStyle.paints[0];
  if (!firstPaint || firstPaint.type !== "SOLID" || !firstPaint.color) {
    return ["Figma style is not a solid color"];
  }
  const actual = firstPaint.color;
  if (!colorsClose(expected, actual)) {
    return [
      `Color: expected ${token.hex}, got ${rgbaToHex(actual)}`,
    ];
  }
  return null; // match
}

function diffFont(
  token: FontToken,
  figmaStyle: FigmaTextStyleEntry
): string[] | null {
  const diffs: string[] = [];
  if (figmaStyle.fontFamily !== token.fontFamily) {
    diffs.push(`fontFamily: expected "${token.fontFamily}", got "${figmaStyle.fontFamily}"`);
  }
  if (figmaStyle.fontWeight !== token.fontWeight) {
    diffs.push(`fontWeight: expected ${token.fontWeight}, got ${figmaStyle.fontWeight}`);
  }
  if (figmaStyle.fontSize !== token.fontSize) {
    diffs.push(`fontSize: expected ${token.fontSize}, got ${figmaStyle.fontSize}`);
  }
  if (token.lineHeight !== undefined && figmaStyle.lineHeight) {
    if (Math.abs(figmaStyle.lineHeight.value - token.lineHeight) > 0.5) {
      diffs.push(`lineHeight: expected ${token.lineHeight}, got ${figmaStyle.lineHeight.value}`);
    }
  }
  if (token.letterSpacing !== undefined && figmaStyle.letterSpacing) {
    if (Math.abs(figmaStyle.letterSpacing.value - token.letterSpacing) > 0.01) {
      diffs.push(`letterSpacing: expected ${token.letterSpacing}, got ${figmaStyle.letterSpacing.value}`);
    }
  }
  return diffs.length > 0 ? diffs : null;
}

function diffEffect(
  token: EffectToken,
  figmaStyle: FigmaEffectStyleEntry
): string[] | null {
  const diffs: string[] = [];

  if (token.effects.length !== figmaStyle.effects.length) {
    diffs.push(`Effect count: expected ${token.effects.length}, got ${figmaStyle.effects.length}`);
    return diffs;
  }

  for (let i = 0; i < token.effects.length; i++) {
    const expected = token.effects[i];
    const actual = figmaStyle.effects[i];

    if (expected.type !== actual.type) {
      diffs.push(`effects[${i}].type: expected "${expected.type}", got "${actual.type}"`);
      continue;
    }

    const expectedRadius = expected.radius ?? 0;
    if (Math.abs(expectedRadius - actual.radius) > 0.5) {
      diffs.push(`effects[${i}].radius: expected ${expectedRadius}, got ${actual.radius}`);
    }

    if (expected.color && actual.color) {
      if (!colorsClose(expected.color, actual.color)) {
        diffs.push(
          `effects[${i}].color: expected ${rgbaToHex(expected.color)}, got ${rgbaToHex(actual.color)}`
        );
      }
    }

    if (expected.offset && actual.offset) {
      if (
        Math.abs((expected.offset.x ?? 0) - actual.offset.x) > 0.5 ||
        Math.abs((expected.offset.y ?? 0) - actual.offset.y) > 0.5
      ) {
        diffs.push(
          `effects[${i}].offset: expected (${expected.offset.x},${expected.offset.y}), got (${actual.offset.x},${actual.offset.y})`
        );
      }
    }

    if (expected.spread !== undefined && actual.spread !== undefined) {
      if (Math.abs(expected.spread - actual.spread) > 0.5) {
        diffs.push(`effects[${i}].spread: expected ${expected.spread}, got ${actual.spread}`);
      }
    }
  }

  return diffs.length > 0 ? diffs : null;
}

// ─── Main handler ────────────────────────────────────────────────────

export function handleDiffTokens(
  params: DiffTokensParams
): DiffTokensResult {
  const { colors = [], fonts = [], effects = [], figmaStyles } = params;

  if (!figmaStyles) {
    throw new Error(
      "figmaStyles is required. Provide Figma style data from the official Figma MCP " +
      "(use_figma with figma.getLocalPaintStyles/getLocalTextStyles/getLocalEffectStyles) " +
      "or from the REST API (figma_get_styles)."
    );
  }

  const paintStyles = figmaStyles.paintStyles ?? [];
  const textStyles = figmaStyles.textStyles ?? [];
  const effectStyles = figmaStyles.effectStyles ?? [];

  // Index Figma styles by name
  const paintByName = new Map(paintStyles.map(s => [s.name, s]));
  const textByName = new Map(textStyles.map(s => [s.name, s]));
  const effectByName = new Map(effectStyles.map(s => [s.name, s]));

  const figmaOnly: DiffEntry[] = [];
  const codeOnly: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  const matched: DiffEntry[] = [];

  // Track which Figma styles were matched
  const matchedPaintNames = new Set<string>();
  const matchedTextNames = new Set<string>();
  const matchedEffectNames = new Set<string>();

  // Compare colors
  for (const token of colors) {
    const figmaStyle = paintByName.get(token.name);
    if (!figmaStyle) {
      codeOnly.push({ name: token.name, type: "paint" });
      continue;
    }
    matchedPaintNames.add(token.name);
    const diffs = diffColor(token, figmaStyle);
    if (diffs) {
      changed.push({ name: token.name, type: "paint", differences: diffs });
    } else {
      matched.push({ name: token.name, type: "paint" });
    }
  }

  // Compare fonts
  for (const token of fonts) {
    const figmaStyle = textByName.get(token.name);
    if (!figmaStyle) {
      codeOnly.push({ name: token.name, type: "text" });
      continue;
    }
    matchedTextNames.add(token.name);
    const diffs = diffFont(token, figmaStyle);
    if (diffs) {
      changed.push({ name: token.name, type: "text", differences: diffs });
    } else {
      matched.push({ name: token.name, type: "text" });
    }
  }

  // Compare effects
  for (const token of effects) {
    const figmaStyle = effectByName.get(token.name);
    if (!figmaStyle) {
      codeOnly.push({ name: token.name, type: "effect" });
      continue;
    }
    matchedEffectNames.add(token.name);
    const diffs = diffEffect(token, figmaStyle);
    if (diffs) {
      changed.push({ name: token.name, type: "effect", differences: diffs });
    } else {
      matched.push({ name: token.name, type: "effect" });
    }
  }

  // Figma-only styles (not in provided tokens)
  for (const s of paintStyles) {
    if (!matchedPaintNames.has(s.name)) {
      figmaOnly.push({ name: s.name, type: "paint" });
    }
  }
  for (const s of textStyles) {
    if (!matchedTextNames.has(s.name)) {
      figmaOnly.push({ name: s.name, type: "text" });
    }
  }
  for (const s of effectStyles) {
    if (!matchedEffectNames.has(s.name)) {
      figmaOnly.push({ name: s.name, type: "effect" });
    }
  }

  return {
    figmaOnly,
    codeOnly,
    changed,
    matched,
    summary: {
      figmaOnly: figmaOnly.length,
      codeOnly: codeOnly.length,
      changed: changed.length,
      matched: matched.length,
    },
  };
}
