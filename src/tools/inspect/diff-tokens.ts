import type { ToolContext } from "../../shared/context.js";
import {
  handleGetLocalStyles,
  type LocalPaintStyle,
  type LocalTextStyle,
  type LocalEffectStyle,
} from "./get-local-styles.js";

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
    color?: { r: number; g: number; b: number; a: number };
    offset?: { x: number; y: number };
    spread?: number;
  }>;
}

interface DiffTokensParams {
  colors?: ColorToken[];
  fonts?: FontToken[];
  effects?: EffectToken[];
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

// ─── Color comparison helpers ────────────────────────────────────────

const COLOR_TOLERANCE = 1 / 255; // ±1 in 0-255 range

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
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
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  return { r, g, b, a };
}

function colorsClose(
  a: { r: number; g: number; b: number; a: number },
  b: { r: number; g: number; b: number; a: number }
): boolean {
  return (
    Math.abs(a.r - b.r) <= COLOR_TOLERANCE &&
    Math.abs(a.g - b.g) <= COLOR_TOLERANCE &&
    Math.abs(a.b - b.b) <= COLOR_TOLERANCE &&
    Math.abs(a.a - b.a) <= COLOR_TOLERANCE
  );
}

function rgbaToHex(c: { r: number; g: number; b: number; a: number }): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(c.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(c.b * 255).toString(16).padStart(2, "0");
  if (c.a < 1) {
    const a = Math.round(c.a * 255).toString(16).padStart(2, "0");
    return `#${r}${g}${b}${a}`;
  }
  return `#${r}${g}${b}`;
}

// ─── Diff logic ──────────────────────────────────────────────────────

function diffColor(
  token: ColorToken,
  figmaStyle: LocalPaintStyle
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
  figmaStyle: LocalTextStyle
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
  figmaStyle: LocalEffectStyle
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

export async function handleDiffTokens(
  ctx: ToolContext,
  params: DiffTokensParams
): Promise<DiffTokensResult> {
  const { colors = [], fonts = [], effects = [] } = params;

  // 1. Read existing Figma styles
  const existing = await handleGetLocalStyles(ctx, {});

  // Index Figma styles by name
  const paintByName = new Map<string, LocalPaintStyle>();
  for (const s of existing.paintStyles) paintByName.set(s.name, s);

  const textByName = new Map<string, LocalTextStyle>();
  for (const s of existing.textStyles) textByName.set(s.name, s);

  const effectByName = new Map<string, LocalEffectStyle>();
  for (const s of existing.effectStyles) effectByName.set(s.name, s);

  const figmaOnly: DiffEntry[] = [];
  const codeOnly: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  const matched: DiffEntry[] = [];

  // Track which Figma styles were matched
  const matchedPaintNames = new Set<string>();
  const matchedTextNames = new Set<string>();
  const matchedEffectNames = new Set<string>();

  // 2. Compare colors
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

  // 3. Compare fonts
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

  // 4. Compare effects
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

  // 5. Figma-only styles (not in provided tokens)
  for (const s of existing.paintStyles) {
    if (!matchedPaintNames.has(s.name)) {
      figmaOnly.push({ name: s.name, type: "paint" });
    }
  }
  for (const s of existing.textStyles) {
    if (!matchedTextNames.has(s.name)) {
      figmaOnly.push({ name: s.name, type: "text" });
    }
  }
  for (const s of existing.effectStyles) {
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
