import type { ToolContext } from "../../shared/context.js";

interface ExportImagesParams {
  nodeIds: string[];
  format?: "png" | "svg" | "jpg" | "pdf";
  scale?: number;
}

interface ExportImagesResult {
  images: Record<string, string>;
  format: string;
  scale: number;
  note: string;
}

/**
 * Export node renders via the Figma REST API (no plugin needed).
 * Returns temporary URLs to rendered images hosted by Figma.
 */
export async function handleExportImages(
  ctx: ToolContext,
  params: ExportImagesParams
): Promise<ExportImagesResult> {
  const { nodeIds, format = "png", scale = 2 } = params;

  if (!nodeIds.length) {
    throw new Error("At least one node ID is required");
  }

  const images = await ctx.rest.getImages(nodeIds, format, scale);

  return {
    images,
    format,
    scale,
    note: "URLs are temporary (expire after ~30 days). Download or embed as needed.",
  };
}
