import type { ToolContext } from "../../shared/context.js";
import type { GeneratedFile } from "../../shared/types.js";

interface ExportTokensParams {
  format?: string;
}

export async function handleExportTokens(
  ctx: ToolContext,
  params: ExportTokensParams
): Promise<{
  format: string;
  file: GeneratedFile;
}> {
  const { format = "tailwind" } = params;
  const state = ctx.stateManager.current;

  // Get the most recent token extraction from state
  // For now, we need to extract tokens from the root node
  const rootNodeId = state.rootNodeId;
  if (!rootNodeId) {
    throw new Error("No root node set. Run figma_get_tree or figma_extract_tokens first.");
  }

  // Import dynamically to avoid circular deps
  const { handleExtractTokens } = await import("../inspect/extract-tokens.js");
  const { tokens } = await handleExtractTokens(ctx, { nodeId: rootNodeId });

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
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  return { format, file };
}

function emitTailwindConfig(tokens: {
  colors: Array<{ raw: string | number; tailwind?: string }>;
  fonts: Array<{ raw: string | number }>;
  spacing: Array<{ raw: string | number }>;
  radii: Array<{ raw: string | number }>;
}): GeneratedFile {
  const colors: Record<string, string> = {};
  for (const token of tokens.colors) {
    const hex = String(token.raw);
    const name = hex.replace("#", "figma-");
    colors[name] = hex;
  }

  const spacing: Record<string, string> = {};
  for (const token of tokens.spacing) {
    const px = Number(token.raw);
    spacing[`figma-${px}`] = `${px}px`;
  }

  const content = `// Auto-generated from Figma design tokens
// Add these to your tailwind.config.ts extend section

export const figmaTokens = {
  colors: ${JSON.stringify(colors, null, 4)},
  spacing: ${JSON.stringify(spacing, null, 4)},
};
`;

  return {
    path: "figma-tokens.ts",
    content,
    type: "typescript",
  };
}

function emitCssVariables(tokens: {
  colors: Array<{ raw: string | number; cssVar?: string }>;
  spacing: Array<{ raw: string | number }>;
  radii: Array<{ raw: string | number }>;
}): GeneratedFile {
  const lines: string[] = ["/* Auto-generated from Figma design tokens */", ":root {"];

  for (const token of tokens.colors) {
    lines.push(`  --figma-color-${String(token.raw).replace("#", "")}: ${token.raw};`);
  }

  for (const token of tokens.spacing) {
    lines.push(`  --figma-spacing-${token.raw}: ${token.raw}px;`);
  }

  for (const token of tokens.radii) {
    lines.push(`  --figma-radius-${token.raw}: ${token.raw}px;`);
  }

  lines.push("}");

  return {
    path: "figma-tokens.css",
    content: lines.join("\n"),
    type: "css",
  };
}
