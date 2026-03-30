import type { FigmaRawNode } from "../shared/types.js";

export interface DetectedPattern {
  label: string;
  exemplarNodeId: string;
  occurrences: string[];
  similarity: number;
  childStructure: string;
}

/**
 * Detect repeated structural patterns in a node tree.
 * Used by component-plan to identify candidates for component extraction.
 */
export function detectPatterns(
  root: FigmaRawNode,
  minSimilarity = 0.8,
  minOccurrences = 2
): DetectedPattern[] {
  // Build structural fingerprints for all frame/group nodes
  const fingerprints = new Map<string, Array<{ nodeId: string; node: FigmaRawNode }>>();

  walkNodes(root, (node) => {
    const type = (node.type || "").toUpperCase();
    if (type !== "FRAME" && type !== "GROUP" && type !== "COMPONENT" && type !== "INSTANCE") return;
    if (!node.children || node.children.length === 0) return;

    const fp = structuralFingerprint(node);
    if (!fingerprints.has(fp)) {
      fingerprints.set(fp, []);
    }
    fingerprints.get(fp)!.push({ nodeId: node.id, node });
  });

  // Filter to patterns with enough occurrences
  const patterns: DetectedPattern[] = [];

  for (const [fp, nodes] of fingerprints) {
    if (nodes.length < minOccurrences) continue;

    // Compute pairwise similarity for the group
    const exemplar = nodes[0];
    const occurrences = nodes
      .filter((n) => {
        const sim = computeSimilarity(exemplar.node, n.node);
        return sim >= minSimilarity;
      })
      .map((n) => n.nodeId);

    if (occurrences.length < minOccurrences) continue;

    patterns.push({
      label: suggestPatternLabel(exemplar.node),
      exemplarNodeId: exemplar.nodeId,
      occurrences,
      similarity: 1.0, // exact structural match for same fingerprint
      childStructure: fp,
    });
  }

  // Sort by occurrence count descending
  return patterns.sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/**
 * Create a structural fingerprint from a node's child types and count.
 * Same fingerprint = same structure (regardless of content).
 */
function structuralFingerprint(node: FigmaRawNode): string {
  const children = node.children || [];
  const types = children.map((c) => {
    const t = (c.type || "UNKNOWN").toUpperCase();
    const childCount = c.children?.length || 0;
    return `${t}(${childCount})`;
  });
  return types.join("|");
}

/**
 * Compute similarity between two nodes based on:
 * - Child count match
 * - Child type sequence match
 * - Relative size similarity
 */
function computeSimilarity(a: FigmaRawNode, b: FigmaRawNode): number {
  const aChildren = a.children || [];
  const bChildren = b.children || [];

  // Child count similarity
  const maxChildren = Math.max(aChildren.length, bChildren.length);
  if (maxChildren === 0) return 1;
  const countSim = Math.min(aChildren.length, bChildren.length) / maxChildren;

  // Type sequence similarity (LCS-based)
  const aTypes = aChildren.map((c) => c.type || "");
  const bTypes = bChildren.map((c) => c.type || "");
  const typeSim = sequenceSimilarity(aTypes, bTypes);

  // Size similarity
  let sizeSim = 1;
  if (a.absoluteBoundingBox && b.absoluteBoundingBox) {
    const aBounds = a.absoluteBoundingBox;
    const bBounds = b.absoluteBoundingBox;
    const wRatio = Math.min(aBounds.width, bBounds.width) / Math.max(aBounds.width, bBounds.width);
    const hRatio =
      Math.min(aBounds.height, bBounds.height) / Math.max(aBounds.height, bBounds.height);
    sizeSim = (wRatio + hRatio) / 2;
  }

  return countSim * 0.3 + typeSim * 0.5 + sizeSim * 0.2;
}

function sequenceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  let matches = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / maxLen;
}

function suggestPatternLabel(node: FigmaRawNode): string {
  const name = node.name || "";
  // Use existing name if semantic
  if (!/^(Group|Frame|Rectangle)\s*\d*$/i.test(name)) return name;

  const childTypes = (node.children || []).map((c) => c.type || "");
  if (childTypes.includes("TEXT") && childTypes.includes("RECTANGLE")) return "Card";
  if (childTypes.every((t) => t === "TEXT")) return "TextBlock";
  if (childTypes.includes("VECTOR") || childTypes.includes("BOOLEAN_OPERATION")) return "IconCard";
  return "RepeatedBlock";
}

function walkNodes(node: FigmaRawNode, visit: (n: FigmaRawNode) => void): void {
  visit(node);
  for (const child of node.children || []) walkNodes(child, visit);
}
