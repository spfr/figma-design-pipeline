import { describe, expect, it } from "vitest";
import { handleExecute } from "./execute.js";

describe("handleExecute fallback generation", () => {
  it("resolves batch references in fallback JS when the plugin bridge is disconnected", async () => {
    const result = await handleExecute(null, {
      actions: [
        { type: "create_page", name: "Smoke Page" },
        { type: "create_frame", name: "Smoke Frame", parentId: "$ref:node-0", width: 400, height: 240, x: 0, y: 0 },
      ],
      dryRun: true,
      stopOnError: true,
      rollbackOnError: true,
      timeoutMs: 10_000,
    });

    expect(result.pluginConnected).toBe(false);
    expect(result.fallbackJs).toContain("const resolveRefId = (id) => {");
    expect(result.fallbackJs).toContain('const getNode = (id) => figma.getNodeById(resolveRefId(id));');
    expect(result.fallbackJs).toContain('getNode("$ref:node-0").appendChild(f);');
  });

  it("supports create_text in fallback JS and sanitizes alpha into paint opacity", async () => {
    const result = await handleExecute(null, {
      actions: [
        {
          type: "create_text",
          parentId: "1:2",
          characters: "Hello",
          name: "Hero/Title",
          fontFamily: "Inter",
          fontWeight: 600,
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 0.5 } }],
          textAlignHorizontal: "CENTER",
          textAutoResize: "HEIGHT",
        },
      ],
      dryRun: true,
      stopOnError: true,
      rollbackOnError: true,
      timeoutMs: 10_000,
    });

    expect(result.pluginConnected).toBe(false);
    expect(result.fallbackJs).toContain("const sanitizePaints = (paints) =>");
    expect(result.fallbackJs).toContain('const t = figma.createText();');
    expect(result.fallbackJs).toContain('t.fills = sanitizePaints([{');
    expect(result.fallbackJs).toContain('results.push({ type: "create_text", nodeId: t.id });');
  });
});
