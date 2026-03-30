import type { ToolContext } from "../../shared/context.js";
import type { EnrichedNode, PlanRecord } from "../../shared/types.js";
import type { Action } from "../../shared/actions.js";
import { handleGetTree } from "../inspect/get-tree.js";

interface PlanGroupingParams {
  nodeId: string;
  strategy?: "semantic" | "spatial" | "minimal";
}

export async function handlePlanGrouping(
  ctx: ToolContext,
  params: PlanGroupingParams
): Promise<{ planId: string; nodeId: string; actionCount: number; actions: Action[]; plan: PlanRecord }> {
  const { nodeId, strategy = "semantic" } = params;

  const { tree } = await handleGetTree(ctx, { nodeId, includeStyles: false });

  const actions: Action[] = [];

  if (strategy === "semantic") {
    planSemanticGrouping(tree, actions);
  } else if (strategy === "spatial") {
    planSpatialGrouping(tree, actions);
  } else {
    planMinimalGrouping(tree, actions);
  }

  const plan = ctx.stateManager.addPlan("figma_plan_grouping", nodeId, actions);
  await ctx.stateManager.save();

  return { planId: plan.planId, nodeId, actionCount: actions.length, actions, plan };
}

/**
 * Semantic grouping: group children by their classification into named frames.
 */
function planSemanticGrouping(node: EnrichedNode, actions: Action[]): void {
  // Only process nodes with many direct children that could benefit from grouping
  if (node.childCount < 5) {
    for (const child of node.children) planSemanticGrouping(child, actions);
    return;
  }

  // Group children by classification
  const groups = new Map<string, EnrichedNode[]>();
  for (const child of node.children) {
    const key = child.classification;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(child);
  }

  // Create frames for groups with 2+ members
  for (const [classification, members] of groups) {
    if (members.length < 2) continue;
    if (classification === "unknown") continue;

    // Calculate bounding box for the group
    const bounds = computeGroupBounds(members);
    if (!bounds) continue;

    const frameName = `Section/${classification.charAt(0).toUpperCase() + classification.slice(1)}`;

    // Create frame action
    actions.push({
      type: "create_frame",
      name: frameName,
      parentId: node.id,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });

    // Note: Move actions would reference the new frame's ID,
    // which we don't know yet. The apply-batch handler will
    // need to chain these using the created frame's ID.
    // For now, we document the intent.
  }

  // Recurse into children
  for (const child of node.children) planSemanticGrouping(child, actions);
}

/**
 * Spatial grouping: group by physical proximity on canvas.
 */
function planSpatialGrouping(node: EnrichedNode, actions: Action[]): void {
  if (node.childCount < 3) {
    for (const child of node.children) planSpatialGrouping(child, actions);
    return;
  }

  // Find clusters of spatially close nodes
  const clusters = findSpatialClusters(node.children);

  for (const cluster of clusters) {
    if (cluster.length < 2) continue;

    const bounds = computeGroupBounds(cluster);
    if (!bounds) continue;

    actions.push({
      type: "create_frame",
      name: `Group/Cluster`,
      parentId: node.id,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  }

  for (const child of node.children) planSpatialGrouping(child, actions);
}

/**
 * Minimal grouping: only group obviously related items (e.g., card grids).
 */
function planMinimalGrouping(node: EnrichedNode, actions: Action[]): void {
  // Only group card-like patterns
  const cards = node.children.filter(
    (c) => c.classification === "card" || c.classification === "metric"
  );

  if (cards.length >= 3) {
    const bounds = computeGroupBounds(cards);
    if (bounds) {
      actions.push({
        type: "create_frame",
        name: "Grid/Cards",
        parentId: node.id,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
    }
  }

  for (const child of node.children) planMinimalGrouping(child, actions);
}

function computeGroupBounds(
  nodes: EnrichedNode[]
): { x: number; y: number; width: number; height: number } | null {
  const boundsNodes = nodes.filter((n) => n.bounds);
  if (boundsNodes.length === 0) return null;

  const minX = Math.min(...boundsNodes.map((n) => n.bounds!.x));
  const minY = Math.min(...boundsNodes.map((n) => n.bounds!.y));
  const maxX = Math.max(...boundsNodes.map((n) => n.bounds!.x + n.bounds!.width));
  const maxY = Math.max(...boundsNodes.map((n) => n.bounds!.y + n.bounds!.height));

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function findSpatialClusters(nodes: EnrichedNode[]): EnrichedNode[][] {
  const withBounds = nodes.filter((n) => n.bounds);
  if (withBounds.length < 2) return [];

  // Simple cluster: group nodes that are within 50px of each other
  const threshold = 50;
  const visited = new Set<string>();
  const clusters: EnrichedNode[][] = [];

  for (const node of withBounds) {
    if (visited.has(node.id)) continue;

    const cluster: EnrichedNode[] = [node];
    visited.add(node.id);

    for (const other of withBounds) {
      if (visited.has(other.id)) continue;
      if (isNearby(node, other, threshold)) {
        cluster.push(other);
        visited.add(other.id);
      }
    }

    if (cluster.length >= 2) clusters.push(cluster);
  }

  return clusters;
}

function isNearby(a: EnrichedNode, b: EnrichedNode, threshold: number): boolean {
  if (!a.bounds || !b.bounds) return false;
  const ax = a.bounds.x + a.bounds.width / 2;
  const ay = a.bounds.y + a.bounds.height / 2;
  const bx = b.bounds.x + b.bounds.width / 2;
  const by = b.bounds.y + b.bounds.height / 2;
  const dist = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
  return dist < threshold + Math.max(a.bounds.width, a.bounds.height, b.bounds.width, b.bounds.height) / 2;
}
