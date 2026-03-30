import { mkdir, cp } from "node:fs/promises";
import { build } from "esbuild";

const bridgePort = process.env.BRIDGE_PORT || "4010";

await mkdir("dist/plugin", { recursive: true });

await build({
  entryPoints: ["src/plugin/code.ts"],
  outfile: "dist/plugin/code.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2017",
  logLevel: "info",
  define: {
    __BRIDGE_PORT__: JSON.stringify(bridgePort),
  },
});

await cp("src/plugin/manifest.json", "dist/plugin/manifest.json");
console.log(`Plugin build complete: dist/plugin/ (bridge port: ${bridgePort})`);
