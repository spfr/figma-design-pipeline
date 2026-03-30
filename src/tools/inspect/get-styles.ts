import type { ToolContext } from "../../shared/context.js";

interface StyleMeta {
  key: string;
  name: string;
  description: string;
  styleType: string;
  nodeId: string;
}

interface GetStylesResult {
  styles: StyleMeta[];
  totalCount: number;
  byType: Record<string, number>;
}

/**
 * List all published styles in the Figma file via REST API.
 * Returns style keys, names, types (FILL, TEXT, EFFECT, GRID), and node IDs.
 */
export async function handleGetStyles(
  ctx: ToolContext
): Promise<GetStylesResult> {
  const data = (await ctx.rest.getFileStyles()) as {
    meta?: { styles?: Array<{
      key: string;
      name: string;
      description: string;
      style_type: string;
      node_id: string;
    }> };
  };

  const raw = data?.meta?.styles || [];
  const styles: StyleMeta[] = raw.map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description,
    styleType: s.style_type,
    nodeId: s.node_id,
  }));

  // Group counts by type
  const byType: Record<string, number> = {};
  for (const s of styles) {
    byType[s.styleType] = (byType[s.styleType] || 0) + 1;
  }

  return { styles, totalCount: styles.length, byType };
}
