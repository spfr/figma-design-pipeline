#!/usr/bin/env tsx
/**
 * Generate a component registry from a project codebase.
 *
 * Usage:
 *   npx tsx scripts/generate-registry.ts /path/to/project [registry-name]
 *
 * The script scans common component directories and writes:
 *   /path/to/project/registry/<registry-name>-components.json
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const PROJECT_PATH = resolve(process.argv[2] || process.cwd());
const REGISTRY_NAME = process.argv[3] || "default";
const OUTPUT_PATH = join(PROJECT_PATH, "registry", `${REGISTRY_NAME}-components.json`);
const SCAN_DIRS = [
  ["src/components", "components"],
  ["src/components/ui", "ui"],
  ["src/components/blocks", "blocks"],
  ["src/components/sections", "sections"],
  ["src/components/templates", "templates"],
];

interface RegistryEntry {
  id: string;
  name: string;
  path: string;
  category: string;
  description: string;
  props: Array<{ name: string; type: string; required: boolean; default?: unknown }>;
  figmaSignature: { keywords: string[] };
  schemaFields?: Record<string, string>;
}

async function scanDirectory(dir: string, category: string): Promise<RegistryEntry[]> {
  const entries: RegistryEntry[] = [];

  try {
    const files = await readdir(join(PROJECT_PATH, dir));
    const componentFiles = files.filter((file) => file.endsWith(".astro") || file.endsWith(".tsx") || file.endsWith(".jsx"));

    for (const file of componentFiles) {
      const fullPath = join(PROJECT_PATH, dir, file);
      const content = await readFile(fullPath, "utf-8");
      const name = basename(file, extname(file));
      const id = name.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");

      const propsMatch = content.match(/interface Props\s*\{([\s\S]*?)\}/);
      const props = propsMatch ? parseProps(propsMatch[1]) : [];

      const descMatch = content.match(/\/\*\*\s*([\s\S]*?)\*\//);
      const description = descMatch
        ? descMatch[1].replace(/\s*\*\s*/g, " ").trim()
        : `${name} component`;

      const keywords = name
        .replace(/([A-Z])/g, " $1")
        .trim()
        .toLowerCase()
        .split(/\s+/);

      entries.push({
        id,
        name,
        path: `${dir}/${file}`,
        category,
        description,
        props,
        figmaSignature: { keywords },
      });
    }
  } catch {
    console.error(`Skipping ${dir}: not found`);
  }

  return entries;
}

function parseProps(propsBody: string): Array<{ name: string; type: string; required: boolean }> {
  const props: Array<{ name: string; type: string; required: boolean }> = [];

  for (const line of propsBody.split("\n")) {
    const match = line.match(/^\s*(\w+)(\??)\s*:\s*(.+?);\s*$/);
    if (!match) continue;
    props.push({
      name: match[1],
      type: match[3].trim(),
      required: match[2] !== "?",
    });
  }

  return props;
}

async function main() {
  console.log(`Scanning ${PROJECT_PATH} for components...`);

  const scanned = await Promise.all(
    SCAN_DIRS.map(([dir, category]) => scanDirectory(dir, category))
  );

  const registry = {
    version: "1.0.0",
    project: basename(PROJECT_PATH),
    generatedAt: new Date().toISOString(),
    components: scanned.flat(),
  };

  await mkdir(join(PROJECT_PATH, "registry"), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(registry, null, 2));
  console.log(`Generated registry with ${registry.components.length} components -> ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
