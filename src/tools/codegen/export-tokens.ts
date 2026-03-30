import type { ToolContext } from "../../shared/context.js";
import type { GeneratedFile } from "../../shared/types.js";
import { handleExtractTokens } from "../inspect/extract-tokens.js";

interface ExportTokensParams {
  figmaUrl?: string;
  nodeId?: string;
  format?: "tailwind" | "css" | "json";
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
    const hex = String(token.raw).toLowerCase();
    const name = hex.replace("#", "figma-");
    colors[name] = hex;
  }

  const fontFamily: Record<string, string> = {};
  const fontSize: Record<string, string> = {};
  for (const token of tokens.fonts) {
    const parts = String(token.raw).split("|");
    const family = parts[0];
    const size = parts[1];
    if (family) fontFamily[`figma-${family.toLowerCase().replace(/\s+/g, "-")}`] = family;
    if (size) fontSize[`figma-${size}`] = `${size}px`;
  }

  const spacing: Record<string, string> = {};
  for (const token of tokens.spacing) {
    const px = Number(token.raw);
    spacing[`figma-${px}`] = `${px}px`;
  }

  const borderRadius: Record<string, string> = {};
  for (const token of tokens.radii) {
    const px = Number(token.raw);
    borderRadius[`figma-${px}`] = `${px}px`;
  }

  const content = `// Auto-generated from Figma design tokens
// Add these to your tailwind.config.ts extend section

export const figmaTokens = {
  colors: ${JSON.stringify(colors, null, 4)},
  fontFamily: ${JSON.stringify(fontFamily, null, 4)},
  fontSize: ${JSON.stringify(fontSize, null, 4)},
  spacing: ${JSON.stringify(spacing, null, 4)},
  borderRadius: ${JSON.stringify(borderRadius, null, 4)},
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
  fonts: Array<{ raw: string | number }>;
  spacing: Array<{ raw: string | number }>;
  radii: Array<{ raw: string | number }>;
}): GeneratedFile {
  const lines: string[] = ["/* Auto-generated from Figma design tokens */", ":root {"];

  for (const token of tokens.colors) {
    const hex = String(token.raw).toLowerCase();
    lines.push(`  --figma-color-${hex.replace("#", "")}: ${hex};`);
  }

  for (const token of tokens.fonts) {
    const parts = String(token.raw).split("|");
    const family = parts[0];
    const size = parts[1];
    if (family) lines.push(`  --figma-font-${family.toLowerCase().replace(/\s+/g, "-")}: '${family}';`);
    if (size) lines.push(`  --figma-text-${size}: ${size}px;`);
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
