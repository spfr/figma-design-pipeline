import type { ToolContext } from "../../shared/context.js";
import type { GeneratedFile } from "../../shared/types.js";
import { handleGetTree } from "../inspect/get-tree.js";
import { handleMapComponents } from "./map-components.js";
import { emitAstroTemplate } from "../../codegen/astro-emitter.js";

interface GeneratePageParams {
  nodeId: string;
  templateType?: string;
  registry?: string;
}

export async function handleGeneratePage(
  ctx: ToolContext,
  params: GeneratePageParams
): Promise<{
  nodeId: string;
  file: GeneratedFile;
  mappingsUsed: number;
  unmappedNodes: number;
}> {
  const { nodeId, templateType = "generic", registry = "default" } = params;

  // Get enriched tree
  const { tree } = await handleGetTree(ctx, { nodeId, includeStyles: true });

  // Map components
  const { mappings, unmapped } = await handleMapComponents(ctx, {
    nodeId,
    registry,
  });

  // Generate the template
  const file = emitAstroTemplate({
    mappings,
    tree,
    templateType,
    schemaId: templateType === "generic" ? undefined : templateType,
  });

  return {
    nodeId,
    file,
    mappingsUsed: mappings.length,
    unmappedNodes: unmapped.length,
  };
}
