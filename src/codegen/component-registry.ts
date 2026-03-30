import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ComponentRegistry, ComponentRegistryEntry, FigmaSignature } from "../shared/types.js";
import type { EnrichedNode } from "../shared/types.js";

/**
 * Registry is resolved from CWD (the project being worked on),
 * not from the MCP server's own directory.
 * Override with COMPONENT_REGISTRY_DIR env var if needed.
 */
const REGISTRY_DIR = process.env.COMPONENT_REGISTRY_DIR || join(process.cwd(), "registry");

let cachedRegistry: ComponentRegistry | null = null;

export async function loadRegistry(name = "default"): Promise<ComponentRegistry> {
  if (cachedRegistry) return cachedRegistry;

  const filePath = join(REGISTRY_DIR, `${name}-components.json`);
  const raw = await readFile(filePath, "utf-8");
  cachedRegistry = JSON.parse(raw) as ComponentRegistry;
  return cachedRegistry;
}

/**
 * Match a Figma node to a CMS component using signature matching.
 */
export function matchComponent(
  node: EnrichedNode,
  registry: ComponentRegistry,
  hints?: Array<{ nodeId: string; component: string }>
): { component: ComponentRegistryEntry; confidence: number } | null {
  // Check manual hints first
  const hint = hints?.find((h) => h.nodeId === node.id);
  if (hint) {
    const entry = registry.components.find((c) => c.id === hint.component || c.name === hint.component);
    if (entry) return { component: entry, confidence: 1.0 };
  }

  let bestMatch: { component: ComponentRegistryEntry; confidence: number } | null = null;

  for (const comp of registry.components) {
    const score = computeMatchScore(node, comp.figmaSignature, comp);
    if (score > 0.3 && (!bestMatch || score > bestMatch.confidence)) {
      bestMatch = { component: comp, confidence: score };
    }
  }

  return bestMatch;
}

function computeMatchScore(
  node: EnrichedNode,
  sig: FigmaSignature,
  comp: ComponentRegistryEntry
): number {
  let score = 0;
  let factors = 0;

  // Keyword matching (strongest signal)
  const nameWords = node.name.toLowerCase().split(/[\s\/\-_]+/);
  const classificationMatch = sig.keywords.some(
    (kw) => node.classification === kw || nameWords.includes(kw.toLowerCase())
  );
  if (classificationMatch) {
    score += 0.4;
  }
  factors += 0.4;

  // Position matching
  if (sig.position) {
    if (
      (sig.position === "top" && node.depth <= 1) ||
      (sig.position === "bottom" && node.classification === "footer")
    ) {
      score += 0.15;
    }
    factors += 0.15;
  }

  // Size matching
  if (node.bounds) {
    let sizeMatch = true;
    if (sig.minWidth && node.bounds.width < sig.minWidth) sizeMatch = false;
    if (sig.maxWidth && node.bounds.width > sig.maxWidth) sizeMatch = false;
    if (sig.minHeight && node.bounds.height < sig.minHeight) sizeMatch = false;
    if (sig.maxHeight && node.bounds.height > sig.maxHeight) sizeMatch = false;
    if (sizeMatch) score += 0.2;
    factors += 0.2;
  }

  // Child pattern matching
  if (sig.childPatterns && node.children.length > 0) {
    const childTypes = node.children.map((c) => c.type.toUpperCase());
    const matches = sig.childPatterns.filter((p, i) => childTypes[i] === p);
    const patternScore = matches.length / sig.childPatterns.length;
    score += patternScore * 0.25;
    factors += 0.25;
  }

  return factors > 0 ? score / factors : 0;
}
