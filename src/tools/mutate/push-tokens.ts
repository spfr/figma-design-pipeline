import type { ToolContext } from "../../shared/context.js";
import type { Action } from "../../shared/actions.js";
import { handleGetLocalStyles } from "../inspect/get-local-styles.js";
import { handleApplyBatch } from "./apply-batch.js";

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

interface PushTokensParams {
  colors?: ColorToken[];
  fonts?: FontToken[];
  effects?: EffectToken[];
  onConflict?: "skip" | "rename";
}

interface PushTokensResult {
  created: number;
  skipped: number;
  failed: number;
  details: Array<{
    name: string;
    type: "paint" | "text" | "effect";
    status: "created" | "skipped" | "failed";
    reason?: string;
  }>;
}

// ─── Hex to Figma color ──────────────────────────────────────────────

function hexToFigmaColor(hex: string): { r: number; g: number; b: number; a: number } {
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
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return { r, g, b, a };
}

// ─── Push tokens to Figma ────────────────────────────────────────────

export async function handlePushTokens(
  ctx: ToolContext,
  params: PushTokensParams
): Promise<PushTokensResult> {
  const { colors = [], fonts = [], effects = [], onConflict = "skip" } = params;

  if (colors.length === 0 && fonts.length === 0 && effects.length === 0) {
    throw new Error("At least one token (color, font, or effect) must be provided");
  }

  // 1. Read existing styles
  const existing = await handleGetLocalStyles(ctx, {});
  const existingNames = new Set<string>();
  for (const s of existing.paintStyles) existingNames.add(s.name);
  for (const s of existing.textStyles) existingNames.add(s.name);
  for (const s of existing.effectStyles) existingNames.add(s.name);

  // 2. Build actions, handling conflicts
  const actions: Action[] = [];
  const details: PushTokensResult["details"] = [];

  function resolveName(name: string): string | null {
    if (!existingNames.has(name)) return name;
    if (onConflict === "skip") return null;
    // rename: append suffix
    let suffix = 2;
    let candidate = `${name} (${suffix})`;
    while (existingNames.has(candidate)) {
      suffix++;
      candidate = `${name} (${suffix})`;
    }
    return candidate;
  }

  // Colors
  for (const token of colors) {
    const resolved = resolveName(token.name);
    if (resolved === null) {
      details.push({ name: token.name, type: "paint", status: "skipped", reason: "Already exists" });
      continue;
    }
    const color = hexToFigmaColor(token.hex);
    actions.push({
      type: "create_paint_style",
      name: resolved,
      paints: [{ type: "SOLID", color }],
    } as Action);
    existingNames.add(resolved); // prevent duplicate in same batch
    details.push({ name: resolved, type: "paint", status: "created" });
  }

  // Fonts
  for (const token of fonts) {
    const resolved = resolveName(token.name);
    if (resolved === null) {
      details.push({ name: token.name, type: "text", status: "skipped", reason: "Already exists" });
      continue;
    }
    actions.push({
      type: "create_text_style",
      name: resolved,
      fontFamily: token.fontFamily,
      fontWeight: token.fontWeight,
      fontSize: token.fontSize,
      ...(token.lineHeight !== undefined ? { lineHeight: token.lineHeight } : {}),
      ...(token.letterSpacing !== undefined ? { letterSpacing: token.letterSpacing } : {}),
    } as Action);
    existingNames.add(resolved);
    details.push({ name: resolved, type: "text", status: "created" });
  }

  // Effects
  for (const token of effects) {
    const resolved = resolveName(token.name);
    if (resolved === null) {
      details.push({ name: token.name, type: "effect", status: "skipped", reason: "Already exists" });
      continue;
    }
    actions.push({
      type: "create_effect_style",
      name: resolved,
      effects: token.effects,
    } as Action);
    existingNames.add(resolved);
    details.push({ name: resolved, type: "effect", status: "created" });
  }

  // 3. Apply
  if (actions.length === 0) {
    return {
      created: 0,
      skipped: details.filter((d) => d.status === "skipped").length,
      failed: 0,
      details,
    };
  }

  const batchResult = await handleApplyBatch(ctx, {
    actions,
    dryRun: false,
  });

  // 4. Update details with actual results
  let created = 0;
  let failed = 0;
  let actionIndex = 0;
  for (const detail of details) {
    if (detail.status === "skipped") continue;
    const result = batchResult.results[actionIndex];
    if (result?.status === "applied") {
      detail.status = "created";
      created++;
    } else {
      detail.status = "failed";
      detail.reason = result?.error || "Unknown error";
      failed++;
    }
    actionIndex++;
  }

  return {
    created,
    skipped: details.filter((d) => d.status === "skipped").length,
    failed,
    details,
  };
}
