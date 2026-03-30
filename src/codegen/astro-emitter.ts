import type { EnrichedNode, ComponentMapping, GeneratedFile } from "../shared/types.js";
import { toPascal } from "../shared/naming.js";

interface EmitOptions {
  mappings: ComponentMapping[];
  tree: EnrichedNode;
  templateType: string;
  schemaId?: string;
}

/**
 * Generate an Astro page template from enriched tree and component mappings.
 * Emits a generic Astro-style page template from mapped Figma structure.
 */
export function emitAstroTemplate(options: EmitOptions): GeneratedFile {
  const { mappings, tree, templateType, schemaId } = options;

  const imports = new Set<string>();
  const bodyLines: string[] = [];

  // Always import base components
  imports.add('import Section from "@/components/ui/Section.astro";');
  imports.add('import Container from "@/components/ui/Container.astro";');
  imports.add('import Heading from "@/components/ui/Heading.astro";');
  imports.add('import Text from "@/components/ui/Text.astro";');

  // Add imports for mapped components
  for (const mapping of mappings) {
    const compName = toPascal(mapping.cmsComponent.replace(/-/g, " "));
    // Determine the import path based on component name
    const isUi = ["Section", "Container", "Heading", "Text", "Button"].includes(compName);
    const category = isUi ? "ui" : "blocks";
    imports.add(`import ${compName} from "@/components/${category}/${compName}.astro";`);
  }

  // Generate Props interface
  const propsInterface = generatePropsInterface(templateType, schemaId);

  // Walk tree and emit component usage
  emitNodeContent(tree, mappings, bodyLines, 0);

  // Assemble template
  const sortedImports = [...imports].sort();

  const content = `---
${sortedImports.join("\n")}

${propsInterface}
---

<main
  data-content-collection="${schemaId || templateType}"
  data-content-id={data.id}
>
${bodyLines.join("\n")}
</main>
`;

  return {
    path: `src/components/templates/${toPascal(templateType)}Template.astro`,
    content,
    type: "astro",
  };
}

function generatePropsInterface(templateType: string, schemaId?: string): string {
  const typeName = `${toPascal(templateType)}Data`;
  return `interface Props {
  data: ${typeName};
  isPreview?: boolean;
}

const { data, isPreview = false } = Astro.props;`;
}

function emitNodeContent(
  node: EnrichedNode,
  mappings: ComponentMapping[],
  lines: string[],
  indent: number
): void {
  const pad = "  ".repeat(indent);
  const mapping = mappings.find((m) => m.figmaNodeId === node.id);

  if (mapping) {
    // Emit mapped component
    const compName = toPascal(mapping.cmsComponent.replace(/-/g, " "));
    const props = Object.entries(mapping.propMappings)
      .map(([prop, field]) => `${prop}={data.${field}}`)
      .join("\n    ");

    if (props) {
      lines.push(`${pad}<${compName}`);
      lines.push(`${pad}  ${props}`);
      lines.push(`${pad}/>`);
    } else {
      lines.push(`${pad}<${compName} />`);
    }
    lines.push("");
    return;
  }

  // For sections, wrap in Section component
  if (node.classification === "section" && node.children.length > 0) {
    lines.push(`${pad}<Section>`);
    lines.push(`${pad}  <Container>`);
    for (const child of node.children) {
      emitNodeContent(child, mappings, lines, indent + 2);
    }
    lines.push(`${pad}  </Container>`);
    lines.push(`${pad}</Section>`);
    lines.push("");
    return;
  }

  // For headings
  if (node.classification === "heading" && node.textContent) {
    const level = node.depth <= 1 ? 1 : node.depth <= 3 ? 2 : 3;
    lines.push(`${pad}<Heading level={${level}}>`);
    lines.push(`${pad}  {data.title}`);
    lines.push(`${pad}</Heading>`);
    return;
  }

  // For text blocks
  if (node.classification === "text-block" && node.textContent) {
    lines.push(`${pad}<Text>`);
    lines.push(`${pad}  {data.description}`);
    lines.push(`${pad}</Text>`);
    return;
  }

  // For images
  if (node.classification === "image") {
    lines.push(`${pad}<img`);
    lines.push(`${pad}  src={data.image?.url}`);
    lines.push(`${pad}  alt={data.image?.alt || ""}`);
    lines.push(`${pad}  class="w-full object-cover"`);
    lines.push(`${pad}  loading="lazy"`);
    lines.push(`${pad}/>`);
    return;
  }

  // For container nodes, recurse into children
  if (node.children.length > 0) {
    for (const child of node.children) {
      emitNodeContent(child, mappings, lines, indent);
    }
  }
}
