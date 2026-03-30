import type { FigmaRawNode, FigmaAbsoluteBoundingBox } from "../shared/types.js";

export interface LayoutSuggestion {
  nodeId: string;
  nodeName: string;
  currentLayout: "absolute" | "horizontal" | "vertical" | "none";
  suggestedLayout: "HORIZONTAL" | "VERTICAL" | "NONE";
  confidence: number;
  suggestedSpacing?: number;
  suggestedPadding?: { top: number; right: number; bottom: number; left: number };
  reason: string;
}

/**
 * Analyze a node's children to infer intended layout from absolute positions.
 * Returns suggestions for converting to auto-layout.
 */
export function analyzeLayout(root: FigmaRawNode): LayoutSuggestion[] {
  const suggestions: LayoutSuggestion[] = [];
  walkForLayout(root, suggestions);
  return suggestions;
}

function walkForLayout(node: FigmaRawNode, suggestions: LayoutSuggestion[]): void {
  const type = (node.type || "").toUpperCase();

  // Only analyze frames/groups with children and no existing auto-layout
  if (
    (type === "FRAME" || type === "GROUP") &&
    node.children &&
    node.children.length >= 2 &&
    (!node.layoutMode || node.layoutMode === "NONE")
  ) {
    const suggestion = inferLayout(node);
    if (suggestion) suggestions.push(suggestion);
  }

  for (const child of node.children || []) {
    walkForLayout(child, suggestions);
  }
}

function inferLayout(node: FigmaRawNode): LayoutSuggestion | null {
  const children = (node.children || []).filter((c) => c.absoluteBoundingBox);
  if (children.length < 2) return null;

  const bounds = children.map((c) => c.absoluteBoundingBox!);
  const parentBounds = node.absoluteBoundingBox;

  // Check horizontal arrangement (children lined up left-to-right)
  const horizontalResult = checkHorizontalArrangement(bounds);
  // Check vertical arrangement (children lined up top-to-bottom)
  const verticalResult = checkVerticalArrangement(bounds);

  if (horizontalResult.confidence > verticalResult.confidence && horizontalResult.confidence > 0.5) {
    return {
      nodeId: node.id,
      nodeName: node.name,
      currentLayout: "absolute",
      suggestedLayout: "HORIZONTAL",
      confidence: horizontalResult.confidence,
      suggestedSpacing: horizontalResult.spacing,
      suggestedPadding: parentBounds
        ? inferPadding(parentBounds, bounds, "horizontal")
        : undefined,
      reason: horizontalResult.reason,
    };
  }

  if (verticalResult.confidence > 0.5) {
    return {
      nodeId: node.id,
      nodeName: node.name,
      currentLayout: "absolute",
      suggestedLayout: "VERTICAL",
      confidence: verticalResult.confidence,
      suggestedSpacing: verticalResult.spacing,
      suggestedPadding: parentBounds
        ? inferPadding(parentBounds, bounds, "vertical")
        : undefined,
      reason: verticalResult.reason,
    };
  }

  return null;
}

function checkHorizontalArrangement(
  bounds: FigmaAbsoluteBoundingBox[]
): { confidence: number; spacing: number; reason: string } {
  // Sort by x position
  const sorted = [...bounds].sort((a, b) => a.x - b.x);

  // Check if tops are roughly aligned
  const tops = sorted.map((b) => b.y);
  const topVariance = variance(tops);
  const avgHeight = avg(sorted.map((b) => b.height));

  // High top variance = not horizontally aligned
  if (topVariance > avgHeight * 0.3) {
    return { confidence: 0, spacing: 0, reason: "Tops not aligned" };
  }

  // Check gaps between consecutive items
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
    gaps.push(gap);
  }

  // Check if gaps are consistent
  if (gaps.length === 0) return { confidence: 0, spacing: 0, reason: "No gaps" };

  const avgGap = avg(gaps);
  const gapVariance = variance(gaps);
  const gapConsistency = avgGap > 0 ? 1 - Math.min(gapVariance / avgGap, 1) : 0;

  // No overlapping (negative gaps indicate overlap)
  const hasOverlap = gaps.some((g) => g < -5);
  if (hasOverlap) {
    return { confidence: 0.2, spacing: Math.round(avgGap), reason: "Items overlap" };
  }

  const confidence = Math.min(gapConsistency * 0.6 + (1 - topVariance / (avgHeight || 1)) * 0.4, 1);

  return {
    confidence,
    spacing: Math.round(Math.max(avgGap, 0)),
    reason: `${sorted.length} items arranged left-to-right, gap ~${Math.round(avgGap)}px`,
  };
}

function checkVerticalArrangement(
  bounds: FigmaAbsoluteBoundingBox[]
): { confidence: number; spacing: number; reason: string } {
  // Sort by y position
  const sorted = [...bounds].sort((a, b) => a.y - b.y);

  // Check if lefts are roughly aligned
  const lefts = sorted.map((b) => b.x);
  const leftVariance = variance(lefts);
  const avgWidth = avg(sorted.map((b) => b.width));

  if (leftVariance > avgWidth * 0.3) {
    return { confidence: 0, spacing: 0, reason: "Lefts not aligned" };
  }

  // Check gaps between consecutive items
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height);
    gaps.push(gap);
  }

  if (gaps.length === 0) return { confidence: 0, spacing: 0, reason: "No gaps" };

  const avgGap = avg(gaps);
  const gapVariance = variance(gaps);
  const gapConsistency = avgGap > 0 ? 1 - Math.min(gapVariance / avgGap, 1) : 0;

  const hasOverlap = gaps.some((g) => g < -5);
  if (hasOverlap) {
    return { confidence: 0.2, spacing: Math.round(avgGap), reason: "Items overlap" };
  }

  const confidence = Math.min(gapConsistency * 0.6 + (1 - leftVariance / (avgWidth || 1)) * 0.4, 1);

  return {
    confidence,
    spacing: Math.round(Math.max(avgGap, 0)),
    reason: `${sorted.length} items arranged top-to-bottom, gap ~${Math.round(avgGap)}px`,
  };
}

function inferPadding(
  parent: FigmaAbsoluteBoundingBox,
  children: FigmaAbsoluteBoundingBox[],
  direction: "horizontal" | "vertical"
): { top: number; right: number; bottom: number; left: number } {
  const minX = Math.min(...children.map((c) => c.x));
  const minY = Math.min(...children.map((c) => c.y));
  const maxX = Math.max(...children.map((c) => c.x + c.width));
  const maxY = Math.max(...children.map((c) => c.y + c.height));

  return {
    top: Math.round(Math.max(minY - parent.y, 0)),
    right: Math.round(Math.max(parent.x + parent.width - maxX, 0)),
    bottom: Math.round(Math.max(parent.y + parent.height - maxY, 0)),
    left: Math.round(Math.max(minX - parent.x, 0)),
  };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function variance(nums: number[]): number {
  if (nums.length === 0) return 0;
  const mean = avg(nums);
  return avg(nums.map((n) => Math.abs(n - mean)));
}
