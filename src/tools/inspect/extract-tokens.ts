import type { ToolContext } from "../../shared/context.js";
import type { FigmaRawNode } from "../../shared/types.js";
import { extractTokens, type ExtractedTokens } from "../../analysis/token-extractor.js";

interface ExtractTokensParams {
  nodeId: string;
  tokenTypes?: string[];
}

export async function handleExtractTokens(
  ctx: ToolContext,
  params: ExtractTokensParams
): Promise<{
  nodeId: string;
  tokens: ExtractedTokens;
  summary: Record<string, number>;
}> {
  const {
    nodeId,
    tokenTypes = ["color", "font", "spacing", "radius", "shadow", "opacity"],
  } = params;

  // Fetch raw tree — always needs full style data for accurate token extraction
  const data = (await ctx.rest.getFileNodes([nodeId])) as {
    nodes: Record<string, { document: FigmaRawNode }>;
  };

  const rawRoot = data?.nodes?.[nodeId]?.document;
  if (!rawRoot) {
    throw new Error(`Node ${nodeId} not found in Figma file`);
  }

  const tokens = extractTokens(rawRoot, tokenTypes);

  const summary: Record<string, number> = {
    colors: tokens.colors.length,
    fonts: tokens.fonts.length,
    spacing: tokens.spacing.length,
    radii: tokens.radii.length,
    shadows: tokens.shadows.length,
    opacities: tokens.opacities.length,
  };

  return { nodeId, tokens, summary };
}
