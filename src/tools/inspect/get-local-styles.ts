import { randomUUID } from "node:crypto";
import type { ToolContext } from "../../shared/context.js";
import { batchPayloadSchema } from "../../shared/actions.js";

// ─── Result types from the plugin ────────────────────────────────────

export interface LocalPaintStyle {
  id: string;
  name: string;
  paints: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    opacity?: number;
  }>;
}

export interface LocalTextStyle {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: { value: number; unit: string } | null;
  letterSpacing: { value: number; unit: string } | null;
}

export interface LocalEffectStyle {
  id: string;
  name: string;
  effects: Array<{
    type: string;
    visible: boolean;
    radius: number;
    color?: { r: number; g: number; b: number; a: number };
    offset?: { x: number; y: number };
    spread?: number;
  }>;
}

export interface GetLocalStylesResult {
  paintStyles: LocalPaintStyle[];
  textStyles: LocalTextStyle[];
  effectStyles: LocalEffectStyle[];
  totalCount: number;
}

interface GetLocalStylesParams {
  styleTypes?: Array<"PAINT" | "TEXT" | "EFFECT">;
}

/**
 * Read all local styles from Figma via the plugin.
 * Richer than the REST API — includes full color/font/effect values.
 */
export async function handleGetLocalStyles(
  ctx: ToolContext,
  params: GetLocalStylesParams
): Promise<GetLocalStylesResult> {
  if (!ctx.hub.hasPlugin()) {
    throw new Error(
      "No Figma plugin connected. Open the plugin in Figma to read local styles."
    );
  }

  const requestId = randomUUID();
  const payload = batchPayloadSchema.parse({
    requestId,
    dryRun: false,
    stopOnError: false,
    actions: [
      {
        type: "get_local_styles" as const,
        ...(params.styleTypes ? { styleTypes: params.styleTypes } : {}),
      },
    ],
  });

  const pluginResult = await ctx.hub.sendAndWait<{
    requestId: string;
    results: Array<{
      status: string;
      after?: {
        paintStyles?: LocalPaintStyle[];
        textStyles?: LocalTextStyle[];
        effectStyles?: LocalEffectStyle[];
      };
      error?: string;
    }>;
  }>(payload);

  const first = pluginResult.results[0];
  if (!first || first.status === "failed") {
    throw new Error(first?.error || "Plugin failed to read local styles");
  }

  const data = first.after || {};
  const paintStyles = data.paintStyles || [];
  const textStyles = data.textStyles || [];
  const effectStyles = data.effectStyles || [];

  return {
    paintStyles,
    textStyles,
    effectStyles,
    totalCount: paintStyles.length + textStyles.length + effectStyles.length,
  };
}
