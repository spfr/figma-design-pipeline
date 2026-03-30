import type { ToolContext } from "../../shared/context.js";

interface ComponentMeta {
  key: string;
  name: string;
  description: string;
  nodeId: string;
  containingFrame?: { name: string; nodeId: string };
}

interface GetComponentsResult {
  components: ComponentMeta[];
  totalCount: number;
}

/**
 * List all components in the Figma file via REST API.
 * Returns component keys, names, descriptions, node IDs, and containing frames.
 */
export async function handleGetComponents(
  ctx: ToolContext
): Promise<GetComponentsResult> {
  const data = (await ctx.rest.getFileComponents()) as {
    meta?: { components?: Array<{
      key: string;
      name: string;
      description: string;
      node_id: string;
      containing_frame?: { name: string; nodeId: string };
    }> };
  };

  const raw = data?.meta?.components || [];
  const components: ComponentMeta[] = raw.map((c) => ({
    key: c.key,
    name: c.name,
    description: c.description,
    nodeId: c.node_id,
    containingFrame: c.containing_frame
      ? { name: c.containing_frame.name, nodeId: c.containing_frame.nodeId }
      : undefined,
  }));

  return { components, totalCount: components.length };
}
