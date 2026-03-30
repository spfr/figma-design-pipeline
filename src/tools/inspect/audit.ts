import type { ToolContext } from "../../shared/context.js";
import type {
  AuditResult,
  AuditViolation,
  AuditCheckCategory,
  EnrichedNode,
} from "../../shared/types.js";
import { isGenericName, hasNumberedSuffix } from "../../shared/naming.js";
import { hexToRgba, relativeLuminance } from "../../shared/color.js";
import { handleGetTree } from "./get-tree.js";

interface AuditParams {
  nodeId: string;
  checks?: AuditCheckCategory[];
  maxViolations?: number;
}

export async function handleAudit(ctx: ToolContext, params: AuditParams): Promise<AuditResult> {
  const {
    nodeId,
    checks = ["naming", "structure", "layout", "components", "tokens", "accessibility"],
    maxViolations = 100,
  } = params;

  // Get enriched tree (uses cache if available)
  const { tree } = await handleGetTree(ctx, { nodeId, includeStyles: true });

  const violations: AuditViolation[] = [];
  let totalNodes = 0;

  walkEnriched(tree, (node) => {
    totalNodes++;

    if (checks.includes("naming")) {
      checkNaming(node, violations);
    }
    if (checks.includes("structure")) {
      checkStructure(node, violations);
    }
    if (checks.includes("layout")) {
      checkLayout(node, violations);
    }
    if (checks.includes("components")) {
      checkComponents(node, violations);
    }
    if (checks.includes("tokens")) {
      checkTokens(node, violations);
    }
    if (checks.includes("accessibility")) {
      checkAccessibility(node, violations);
    }
  });

  // Build summary in a single pass
  const summary = {} as AuditResult["summary"];
  for (const cat of checks) {
    summary[cat] = { errors: 0, warnings: 0, info: 0 };
  }
  for (const v of violations) {
    const s = summary[v.category];
    if (!s) continue;
    if (v.severity === "error") s.errors++;
    else if (v.severity === "warning") s.warnings++;
    else s.info++;
  }

  // Truncate violations to avoid overloading LLM context — summary always reflects full counts
  const truncatedViolations = violations.length > maxViolations;
  const returnedViolations = truncatedViolations ? violations.slice(0, maxViolations) : violations;

  return {
    rootNodeId: nodeId,
    totalNodes,
    checksRun: checks,
    ...(truncatedViolations ? { totalViolations: violations.length, truncated: true } : {}),
    violations: returnedViolations,
    summary,
  };
}

// ─── Check: Naming ───────────────────────────────────────────────────

function checkNaming(node: EnrichedNode, violations: AuditViolation[]): void {
  if (isGenericName(node.name)) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "naming",
      severity: "warning",
      message: `Generic name "${node.name}" — should be semantic`,
      suggestion: `Rename to describe purpose (e.g., "${node.classification}")`,
    });
  }

  if (hasNumberedSuffix(node.name) && !isGenericName(node.name)) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "naming",
      severity: "info",
      message: `Numbered suffix in "${node.name}" — possible duplicate`,
    });
  }

  if (!node.name.trim()) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "naming",
      severity: "error",
      message: "Empty node name",
    });
  }
}

// ─── Check: Structure ────────────────────────────────────────────────

function checkStructure(node: EnrichedNode, violations: AuditViolation[]): void {
  // Too many direct children (flat structure)
  if (node.childCount > 20) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "structure",
      severity: "warning",
      message: `${node.childCount} direct children — consider grouping into sections`,
    });
  }

  // Very deep nesting
  if (node.depth > 10) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "structure",
      severity: "info",
      message: `Deeply nested (depth ${node.depth}) — may indicate unnecessary wrapping`,
    });
  }

  // Empty group/frame
  if (
    (node.type === "FRAME" || node.type === "GROUP") &&
    node.childCount === 0
  ) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "structure",
      severity: "warning",
      message: "Empty frame/group — consider removing",
    });
  }
}

// ─── Check: Layout ───────────────────────────────────────────────────

function checkLayout(node: EnrichedNode, violations: AuditViolation[]): void {
  // Absolute positioning where auto-layout would work
  if (
    node.layoutInfo?.mode === "absolute" &&
    node.childCount >= 2 &&
    (node.type === "FRAME" || node.type === "GROUP")
  ) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "layout",
      severity: "warning",
      message: "Uses absolute positioning with multiple children — consider auto-layout",
    });
  }
}

// ─── Check: Components ───────────────────────────────────────────────

function checkComponents(node: EnrichedNode, violations: AuditViolation[]): void {
  // Detached instances (classification suggests it should be a component)
  if (
    !node.isComponent &&
    !node.isInstance &&
    (node.classification === "card" || node.classification === "button") &&
    node.childCount > 0
  ) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "components",
      severity: "info",
      message: `"${node.name}" looks like a ${node.classification} but isn't a component`,
      suggestion: "Consider converting to a reusable component",
    });
  }
}

// ─── Check: Tokens ───────────────────────────────────────────────────

function checkTokens(node: EnrichedNode, violations: AuditViolation[]): void {
  // Non-standard spacing values
  for (const token of node.tokens) {
    if (token.type === "spacing" && typeof token.raw === "number") {
      const val = token.raw;
      // Check if it's a standard 4px grid value
      if (val % 4 !== 0 && val > 1) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          category: "tokens",
          severity: "info",
          message: `Spacing ${val}px is not on the 4px grid`,
          suggestion: `Consider using ${Math.round(val / 4) * 4}px`,
        });
      }
    }
  }
}

// ─── Check: Accessibility ────────────────────────────────────────────

function checkAccessibility(node: EnrichedNode, violations: AuditViolation[]): void {
  // Text too small
  if (node.type === "TEXT" && node.tokens.some((t) => t.type === "font")) {
    const fontToken = node.tokens.find((t) => t.type === "font");
    if (fontToken && typeof fontToken.raw === "string") {
      const parts = fontToken.raw.split("/");
      const fontSize = parseInt(parts[1] || "16");
      if (fontSize < 12) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          category: "accessibility",
          severity: "warning",
          message: `Font size ${fontSize}px may be too small for readability`,
          suggestion: "Minimum recommended: 12px",
        });
      }
    }
  }

  // Images without descriptive names
  if (
    node.classification === "image" &&
    isGenericName(node.name)
  ) {
    violations.push({
      nodeId: node.id,
      nodeName: node.name,
      category: "accessibility",
      severity: "info",
      message: "Image node has generic name — add descriptive alt text name",
    });
  }

  // WCAG contrast check — text over solid background
  if (node.type === "TEXT") {
    const fgToken = node.tokens.find(
      (t) => t.type === "color" && typeof t.raw === "string" && t.raw.startsWith("#")
    );
    if (fgToken && typeof fgToken.raw === "string") {
      const fg = hexToRgba(fgToken.raw);
      const fgLum = relativeLuminance(fg.r, fg.g, fg.b);
      if (fg.a < 0.3) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          category: "accessibility",
          severity: "warning",
          message: `Text opacity is very low (${(fg.a * 100).toFixed(0)}%) — may be invisible`,
          suggestion: "Ensure text has sufficient contrast against its background (WCAG AA: 4.5:1)",
        });
      }
      if (fgLum > 0.9) {
        violations.push({
          nodeId: node.id,
          nodeName: node.name,
          category: "accessibility",
          severity: "info",
          message: `Very light text color (luminance: ${fgLum.toFixed(2)}) — ensure sufficient background contrast`,
          suggestion: "WCAG AA requires 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold)",
        });
      }
    }
  }

  // Touch target too small (interactive elements)
  if (
    (node.classification === "button" || node.classification === "cta") &&
    node.bounds
  ) {
    const minDimension = Math.min(node.bounds.width, node.bounds.height);
    if (minDimension < 44) {
      violations.push({
        nodeId: node.id,
        nodeName: node.name,
        category: "accessibility",
        severity: "warning",
        message: `Touch target is ${minDimension.toFixed(0)}px — minimum recommended is 44px`,
        suggestion: "WCAG 2.5.8 recommends minimum 44x44px touch targets",
      });
    }
  }
}

function walkEnriched(node: EnrichedNode, visit: (n: EnrichedNode) => void): void {
  visit(node);
  for (const child of node.children) walkEnriched(child, visit);
}
