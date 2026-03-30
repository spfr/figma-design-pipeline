// ─── Naming Convention Utilities ──────────────────────────────────────

/** Check if a name is a generic Figma default name */
export function isGenericName(name: string): boolean {
  return /^(Group|Frame|Rectangle|Vector|Image|Text|Card|Column|Row|Ellipse|Line|Polygon|Star|Boolean|Slice|Component|Instance|Section|Sticky)\s*\d*$/i.test(
    name.trim()
  );
}

/** Check if a name looks like an auto-generated numbered suffix */
export function hasNumberedSuffix(name: string): boolean {
  return /\s+\d+$/.test(name.trim());
}

/** Convert to kebab-case */
export function toKebab(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

/** Convert to PascalCase */
export function toPascal(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .split(/[\s\-_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/** Convert to camelCase */
export function toCamel(s: string): string {
  const pascal = toPascal(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Slash-based naming convention for Figma layers.
 * e.g., "Section/Hero", "Card/Feature/Title", "Icon/Arrow"
 */
export function toSlashName(category: string, ...parts: string[]): string {
  return [category, ...parts].map((p) => toPascal(p)).join("/");
}

/**
 * Propose a semantic name based on node type and context.
 * Used by the naming plan tool.
 */
export function proposeSemantic(
  nodeType: string,
  textContent?: string,
  childCount?: number,
  position?: "top" | "middle" | "bottom"
): string {
  const type = nodeType.toLowerCase();

  // Text nodes: use truncated content
  if (type === "text" && textContent) {
    const clean = textContent.trim().slice(0, 30).replace(/\n/g, " ");
    return `Text/${clean || "Label"}`;
  }

  // Image-like nodes
  if (type === "rectangle" || type === "image") {
    return "Image/Placeholder";
  }

  // Vector/shape nodes
  if (type === "vector" || type === "ellipse" || type === "star" || type === "line") {
    return `Shape/${toPascal(type)}`;
  }

  // Frame/group with children = container
  if ((type === "frame" || type === "group") && childCount && childCount > 0) {
    if (position === "top") return "Section/Header";
    if (position === "bottom") return "Section/Footer";
    if (childCount > 5) return "Section/Content";
    return "Container/Group";
  }

  // Fallback
  return `Layer/${toPascal(nodeType)}`;
}

/**
 * Deduplicate names in a flat list by appending index.
 */
export function deduplicateNames(names: Array<{ nodeId: string; name: string }>): typeof names {
  const counts = new Map<string, number>();
  return names.map((entry) => {
    const count = counts.get(entry.name) || 0;
    counts.set(entry.name, count + 1);
    if (count === 0) return entry;
    return { ...entry, name: `${entry.name}-${count + 1}` };
  });
}
