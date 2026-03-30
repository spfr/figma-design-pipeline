import type { ToolContext } from "../../shared/context.js";
import type { GeneratedFile } from "../../shared/types.js";
import { handleGetTree } from "../inspect/get-tree.js";
import { emitSchema } from "../../codegen/schema-emitter.js";

interface GenerateSchemaParams {
  nodeId: string;
  schemaId: string;
}

export async function handleGenerateSchema(
  ctx: ToolContext,
  params: GenerateSchemaParams
): Promise<{
  nodeId: string;
  schemaId: string;
  file: GeneratedFile;
}> {
  const { nodeId, schemaId } = params;

  // Get enriched tree
  const { tree } = await handleGetTree(ctx, { nodeId, includeStyles: true });

  // Generate schema
  const file = emitSchema({
    tree,
    schemaId,
  });

  return { nodeId, schemaId, file };
}
