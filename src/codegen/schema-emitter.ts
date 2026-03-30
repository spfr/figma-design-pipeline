import type { EnrichedNode, GeneratedFile } from "../shared/types.js";
import { toPascal, toCamel } from "../shared/naming.js";

interface SchemaEmitOptions {
  tree: EnrichedNode;
  schemaId: string;
  schemaName?: string;
}

/**
 * Generate a ContentSchema TypeScript definition from an enriched Figma tree.
 * Emits a generic CMS-oriented schema draft from organized Figma structure.
 */
export function emitSchema(options: SchemaEmitOptions): GeneratedFile {
  const { tree, schemaId, schemaName } = options;
  const name = schemaName || toPascal(schemaId.replace(/-/g, " "));
  const varName = `${toCamel(name)}Schema`;

  const fields = inferFields(tree);
  const sections = inferSections(fields);

  const fieldDefs = fields
    .map((f) => {
      let def = `    ${f.name}: {\n`;
      def += `      type: "${f.type}",\n`;
      def += `      label: "${f.label}",\n`;
      if (f.validation) {
        def += `      validation: ${JSON.stringify(f.validation)},\n`;
      }
      if (f.ui) {
        def += `      ui: {\n`;
        def += `        admin: { section: "${f.ui.section}", order: ${f.ui.order} },\n`;
        def += `      },\n`;
      }
      def += `    },`;
      return def;
    })
    .join("\n");

  const sectionDefs = sections
    .map(
      (s) =>
        `      ${s.id}: { title: "${s.title}", order: ${s.order}${s.collapsible ? ", collapsible: true" : ""} },`
    )
    .join("\n");

  const content = `import type { ContentSchema } from "@/lib/content/schema-types";

export const ${varName}: ContentSchema = {
  id: "${schemaId}",
  name: "${name}",
  description: "${name} content type",
  fields: {
${fieldDefs}
  },
  config: {
    titleField: "title",
    enableDrafts: true,
  },
  admin: {
    sections: {
${sectionDefs}
    },
  },
};
`;

  return {
    path: `src/lib/content/schemas/${schemaId}.ts`,
    content,
    type: "typescript",
  };
}

interface InferredField {
  name: string;
  type: string;
  label: string;
  validation?: { required?: boolean };
  ui?: { section: string; order: number };
}

function inferFields(tree: EnrichedNode): InferredField[] {
  const fields: InferredField[] = [];
  const seen = new Set<string>();

  // Always add title
  fields.push({
    name: "title",
    type: "text",
    label: "Title",
    validation: { required: true },
    ui: { section: "overview", order: 1 },
  });
  seen.add("title");

  // Always add slug
  fields.push({
    name: "slug",
    type: "slug",
    label: "URL Slug",
    validation: { required: true },
    ui: { section: "overview", order: 2 },
  });
  seen.add("slug");

  // Walk tree and infer fields from content
  inferFieldsFromNode(tree, fields, seen, "overview", 3);

  // Always add SEO fields
  fields.push(
    {
      name: "seoTitle",
      type: "text",
      label: "SEO Title",
      ui: { section: "seo", order: 1 },
    },
    {
      name: "seoDescription",
      type: "textarea",
      label: "SEO Description",
      ui: { section: "seo", order: 2 },
    }
  );

  return fields;
}

function inferFieldsFromNode(
  node: EnrichedNode,
  fields: InferredField[],
  seen: Set<string>,
  currentSection: string,
  orderStart: number
): number {
  let order = orderStart;

  // Determine section from classification
  const section = classificationToSection(node.classification) || currentSection;

  // Text content → text/textarea/rich-text field
  if (node.textContent && node.classification !== "heading") {
    const fieldName = suggestFieldName(node, seen);
    if (fieldName && !seen.has(fieldName)) {
      seen.add(fieldName);
      const isLong = node.textContent.length > 200;
      fields.push({
        name: fieldName,
        type: isLong ? "rich-text" : "textarea",
        label: toPascal(fieldName.replace(/([A-Z])/g, " $1")),
        ui: { section, order: order++ },
      });
    }
  }

  // Image → image field
  if (node.classification === "image" && !seen.has("featuredImage")) {
    seen.add("featuredImage");
    fields.push({
      name: "featuredImage",
      type: "image",
      label: "Featured Image",
      ui: { section: "media", order: order++ },
    });
  }

  // Metrics → array field
  if (node.classification === "metric" && !seen.has("metrics")) {
    seen.add("metrics");
    fields.push({
      name: "metrics",
      type: "array",
      label: "Key Metrics",
      ui: { section: "results", order: order++ },
    });
  }

  // Recurse
  for (const child of node.children) {
    order = inferFieldsFromNode(child, fields, seen, section, order);
  }

  return order;
}

function classificationToSection(classification: string): string | null {
  const map: Record<string, string> = {
    hero: "overview",
    heading: "overview",
    "text-block": "content",
    quote: "content",
    image: "media",
    metric: "results",
    card: "content",
    "card-grid": "content",
    button: "overview",
    form: "content",
  };
  return map[classification] || null;
}

function suggestFieldName(node: EnrichedNode, seen: Set<string>): string | null {
  // Use classification-based naming
  const map: Record<string, string> = {
    "text-block": "description",
    quote: "quoteText",
    heading: "subtitle",
  };

  let name = map[node.classification] || toCamel(node.classification);
  if (seen.has(name)) {
    // Append context from parent or index
    name = `${name}Text`;
  }
  if (seen.has(name)) return null;
  return name;
}

function inferSections(
  fields: InferredField[]
): Array<{ id: string; title: string; order: number; collapsible?: boolean }> {
  const sectionSet = new Set<string>();
  for (const f of fields) {
    if (f.ui?.section) sectionSet.add(f.ui.section);
  }

  const sectionMeta: Record<string, { title: string; order: number; collapsible?: boolean }> = {
    overview: { title: "Overview", order: 1 },
    content: { title: "Content", order: 2 },
    results: { title: "Results & Impact", order: 3 },
    media: { title: "Media", order: 4, collapsible: true },
    seo: { title: "SEO", order: 10, collapsible: true },
  };

  return [...sectionSet]
    .map((id) => ({
      id,
      ...(sectionMeta[id] || { title: toPascal(id), order: 5 }),
    }))
    .sort((a, b) => a.order - b.order);
}
