# Publishing

This package is published on **npmjs.com** as `@spicefactory/figma-design-pipeline`.

## What Ships

- `dist/index.js` — standalone MCP server bundle (includes WebSocket bridge)
- `plugin/dist/` — Figma plugin (code.js, ui.html, manifest.json)
- `skill/` — design assistant skill
- `scripts/install.mjs` — client installer + plugin deployer
- `scripts/build-server.mjs`, `scripts/build-plugin.mjs` — build scripts (for source installs)

## Before Publishing

```bash
npm install
npm run check
npm test
npm run build          # builds server + plugin
npm pack               # verify package contents
```

Verify the plugin dist is included:
```bash
tar tzf *.tgz | grep plugin
```

## npm Trusted Publisher

- Package: `@spicefactory/figma-design-pipeline`
- GitHub: `spfr/figma-design-pipeline`
- Workflow: `.github/workflows/publish-npm.yml`
- Trigger: tag push `figma-design-pipeline-v*` or manual dispatch

`prepack` runs `npm run build` (server + plugin) automatically.

## Release

```bash
npm version <next-version> --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release <next-version>"
git push origin main
git tag figma-design-pipeline-v<next-version>
git push origin figma-design-pipeline-v<next-version>
```

## Install Command

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

This installs: MCP server registration, skill symlink, and Figma plugin to `~/.figma-design-pipeline/plugin/`.

## Verification

```bash
cd /tmp
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --help
```

Clean-home test:
```bash
TMP_HOME="$(mktemp -d)"
cd /tmp
HOME="$TMP_HOME" npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
ls "$TMP_HOME/.figma-design-pipeline/plugin/manifest.json"
```
