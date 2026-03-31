# Release Checklist

Use this checklist for every public release of SPFR Figma Design Pipeline.

## 1. Local Verification

```bash
npm ci
npm run check
npm test
npm run build       # builds server + plugin
npm pack
```

Verify installer from outside the repo:

```bash
cd /tmp
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --help
```

Verify clean-home install:

```bash
TMP_HOME="$(mktemp -d)"
cd /tmp
HOME="$TMP_HOME" npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

Confirm the plugin was deployed:
```bash
ls ~/.figma-design-pipeline/plugin/manifest.json
```

## 2. Plugin Smoke Test

1. Open Figma Desktop
2. Plugins > Development > Import plugin from manifest
3. Select `~/.figma-design-pipeline/plugin/manifest.json`
4. Run the plugin — should show "Connected (port 4010)"

From any CLI:
```
figma_plugin_status → { connected: true, pluginVersion: "2.0.0" }
```

Test a batch operation:
```
figma_execute({
  actions: [
    { type: "create_page", name: "Test Page" },
    { type: "create_frame", name: "Test Frame", parentId: "PAGE_ID", width: 400, height: 300 }
  ],
  dryRun: true
})
```

## 3. MCP Smoke Test

- Confirm `figma-design-pipeline` is registered as an MCP server
- `figma_get_tree` with a Figma URL
- `figma_audit` on a real file
- `figma_extract_tokens` → verify token output
- `figma_export_tokens` with format "tailwind" and "style-dictionary"
- Use `use_figma` or `figma_execute` to create a simple frame

For REST API tools:
```bash
export FIGMA_ACCESS_TOKEN=figd_...
```

## 4. npm Release

Published via GitHub Actions trusted publishing:

```bash
npm version <next-version> --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release <next-version>"
git push origin main
git tag figma-design-pipeline-v<next-version>
git push origin figma-design-pipeline-v<next-version>
```

Confirm:
- GitHub Actions publish workflow succeeds
- `npm view @spicefactory/figma-design-pipeline version` shows new version
- `npx` install from outside repo works

## 5. GitHub Release

Create release for the tag. Include:
- Changelog highlights
- Install command
- Links to docs and npm

## 6. Update

For end users:

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```
