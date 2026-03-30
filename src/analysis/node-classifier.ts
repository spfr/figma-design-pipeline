import type { FigmaRawNode, NodeClassification } from "../shared/types.js";

/**
 * Classify a Figma node by its visual role using heuristics.
 * Examines: node type, name, size, position, children, text content.
 */
export function classifyNode(
  node: FigmaRawNode,
  parentBounds?: { width: number; height: number },
  siblingIndex?: number,
  totalSiblings?: number
): NodeClassification {
  const name = (node.name || "").toLowerCase();
  const type = (node.type || "").toUpperCase();
  const bounds = node.absoluteBoundingBox;
  const childCount = node.children?.length || 0;

  // ─── Instance/Component: use component-aware classification first ──
  // Instances often have namespaced names (e.g., "Industry/CTASection")
  // that need smarter parsing than the generic name hints below.
  if (type === "INSTANCE" || type === "COMPONENT" || type === "COMPONENT_SET") {
    const result = classifyByComponentName(name, childCount, bounds);
    if (result !== "unknown") return result;
    // Fall through to positional/size heuristics below
  }

  // ─── Explicit name hints (for frames, groups, etc.) ─────────────
  if (/hero/i.test(name)) return "hero";
  if (/header/i.test(name)) return "nav";
  if (/nav(bar|igation)?/i.test(name)) return "nav";
  if (/footer/i.test(name)) return "footer";
  if (/\bbtn\b|button/i.test(name) && !/section/i.test(name)) return "button";
  if (/\bcta\b|call.?to.?action/i.test(name)) return "cta";
  if (/card/i.test(name)) return "card";
  if (/quote|testimonial|blockquote/i.test(name)) return "quote";
  if (/metric|stat|counter|kpi/i.test(name)) return "metric";
  if (/badge|tag|chip/i.test(name)) return "badge";
  if (/divider|separator|line/i.test(name)) return "divider";
  if (/form|input|field/i.test(name)) return "form";
  if (/icon/i.test(name)) return "icon";
  if (/overlay/i.test(name)) return "overlay";
  if (/grid|list/i.test(name)) return "card-grid";
  if (/image|photo|picture|thumbnail|background/i.test(name)) return "image";
  if (/heading|title|h[1-6]/i.test(name)) return "heading";
  if (/expertise|service|feature|benefit|process|intro/i.test(name)) return "section";

  // ─── Type-based classification ──────────────────────────────────
  if (type === "TEXT") {
    const fontSize = node.style?.fontSize || 16;
    if (fontSize >= 28) return "heading";
    return "text-block";
  }

  if (type === "VECTOR" || type === "BOOLEAN_OPERATION") {
    if (bounds && bounds.width < 48 && bounds.height < 48) return "icon";
    return "image";
  }

  if (type === "RECTANGLE" || type === "ELLIPSE") {
    // Small rectangle = possibly icon/badge
    if (bounds && bounds.width < 60 && bounds.height < 60) return "badge";
    // Large rectangle with fills = image placeholder
    if (bounds && bounds.width > 200) return "image";
    return "image";
  }

  // ─── Instance/Component: classify by component name + structure ────
  if (type === "INSTANCE" || type === "COMPONENT") {
    // Try classifying by the node's own name (which often reflects the component name)
    const componentClassification = classifyByComponentName(name, childCount, bounds);
    if (componentClassification !== "unknown") return componentClassification;
    // Fall through to positional/size heuristics below
  }

  // ─── Positional + size heuristics for frames/groups ─────────────
  if (type === "FRAME" || type === "GROUP" || type === "SECTION") {
    // Full-width section at the top = hero
    if (
      parentBounds &&
      bounds &&
      bounds.width >= parentBounds.width * 0.9 &&
      bounds.height > 300 &&
      siblingIndex === 0
    ) {
      return "hero";
    }

    // Full-width section at the bottom = footer
    if (
      totalSiblings &&
      siblingIndex !== undefined &&
      siblingIndex >= totalSiblings - 1 &&
      bounds &&
      bounds.height < 300
    ) {
      return "footer";
    }

    // Grid of similar children = card-grid
    if (childCount >= 3 && hasSimilarChildren(node)) {
      return "card-grid";
    }

    // Wide section = section
    if (parentBounds && bounds && bounds.width >= parentBounds.width * 0.8 && bounds.height > 200) {
      return "section";
    }

    // Small group with few children = card
    if (childCount >= 2 && childCount <= 8 && bounds && bounds.width < 600) {
      return "card";
    }

    // Container/wrapper
    if (childCount > 0) return "container";
  }

  return "unknown";
}

/**
 * Classify an instance/component by its name and structural hints.
 * Handles namespaced names like "Industry/CTASection" by checking each segment.
 * Returns "unknown" if no match — caller should fall through to positional heuristics.
 */
function classifyByComponentName(
  rawName: string,
  childCount: number,
  bounds?: { width: number; height: number }
): NodeClassification {
  // For namespaced names like "Industry/CTASection", check each segment
  // Priority: last segment (most specific) first, then full name
  const segments = rawName.split("/").map((s) => s.trim().toLowerCase());
  const lastSegment = segments[segments.length - 1] || rawName;
  const namesToCheck = segments.length > 1 ? [lastSegment, rawName.toLowerCase()] : [rawName.toLowerCase()];

  for (const name of namesToCheck) {
    if (/hero/i.test(name)) return "hero";
    if (/header/i.test(name)) return "nav";
    if (/nav(bar|igation)?/i.test(name)) return "nav";
    if (/footer/i.test(name)) return "footer";
    // CTA section vs CTA button — check for "section" context
    if (/\bcta\b|call.?to.?action/i.test(name)) return "cta";
    // Button only if not a section-level component
    if (/\b(button|btn)\b/i.test(name) && !/(section|wrapper|group)/i.test(name)) return "button";
    if (/card/i.test(name) && !/(grid|list|section)/i.test(name)) return "card";
    if (/quote|testimonial|blockquote/i.test(name)) return "quote";
    if (/metric|stat|counter|kpi/i.test(name)) return "metric";
    if (/badge|tag|chip/i.test(name)) return "badge";
    if (/divider|separator/i.test(name)) return "divider";
    if (/form|input|field|select|checkbox|radio/i.test(name)) return "form";
    if (/\bicon\b/i.test(name)) return "icon";
    if (/\blogo\b/i.test(name)) return "icon";
    if (/overlay|modal|dialog|popup/i.test(name)) return "overlay";
    if (/grid|list/i.test(name)) return "card-grid";
    if (/image|photo|picture|thumbnail|avatar|background/i.test(name)) return "image";
    if (/heading|title|h[1-6]/i.test(name)) return "heading";
    // Section-level keywords (common in design files)
    if (/section|block|banner|expertise|service|feature|benefit|process|intro|showcase|partnership|outcome/i.test(name)) return "section";
    if (/container|wrapper|layout|column|row/i.test(name)) return "container";
  }

  // Structural heuristics for unnamed/generic components
  if (bounds) {
    // Small component with no children = likely icon or badge
    if (childCount === 0 && bounds.width < 48 && bounds.height < 48) return "icon";
    // Wide + tall = likely a section
    if (bounds.width > 900 && bounds.height > 200) return "section";
  }

  // Can't determine — let parent classifier's positional heuristics handle it
  return "unknown";
}

/** Check if children have similar sizes (suggesting a grid/list pattern) */
function hasSimilarChildren(node: FigmaRawNode): boolean {
  const children = node.children || [];
  if (children.length < 3) return false;

  const sizes = children
    .filter((c) => c.absoluteBoundingBox)
    .map((c) => ({
      w: Math.round(c.absoluteBoundingBox!.width),
      h: Math.round(c.absoluteBoundingBox!.height),
    }));

  if (sizes.length < 3) return false;

  // Check if at least 60% have similar dimensions (within 20%)
  const ref = sizes[0];
  const similar = sizes.filter(
    (s) =>
      Math.abs(s.w - ref.w) / ref.w < 0.2 &&
      Math.abs(s.h - ref.h) / ref.h < 0.2
  );

  return similar.length >= sizes.length * 0.6;
}
