# Release Checklist

Use this checklist for every public release of SPFR Figma Design Pipeline.

## 1. Local Verification

Run from the repo root:

```bash
npm ci
npm run check
npm test
npm run build
npm run build:desktop
npm run build:figma-community
npm pack
```

Verify the published-style installer from outside the repo:

```bash
cd /tmp
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --help
```

Verify a clean-home install:

```bash
TMP_HOME="$(mktemp -d)"
cd /tmp
HOME="$TMP_HOME" npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

Important:
- Run the public `npx -p` command from outside this repository.
- If you are working inside the repo, use `node scripts/install.mjs --client all`.

## 2. Real Machine Smoke Test

Install on your real machine:

```bash
cd /tmp
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

Set:

```bash
export FIGMA_ACCESS_TOKEN=figd_...
```

In Figma desktop:
- `Plugins > Development > Import plugin from manifest...`
- Choose `~/.figma-design-pipeline/plugin/manifest.json`
- Run `SPFR Figma Design Pipeline`

Bridge check:

```bash
curl -sS http://127.0.0.1:4010/health
```

Confirm:
- `ok` is `true`
- `pluginConnected` becomes `true` when the plugin is open

Client smoke test:
- confirm `figma-design-pipeline` is registered in Claude, Codex, or Gemini
- run `figma_get_tree`
- run `figma_apply_batch` with `dryRun: true`
- run one tiny real mutation
- run `figma_verify`

## 3. npm Release

The package is published through GitHub Actions trusted publishing.

Current package:

```text
@spicefactory/figma-design-pipeline
```

Release flow:

```bash
npm version <next-version> --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release <next-version>"
git push origin main:main
git tag figma-design-pipeline-v<next-version>
git push origin figma-design-pipeline-v<next-version>
```

Then confirm:
- GitHub Actions publish workflow succeeds
- `npm view @spicefactory/figma-design-pipeline version` shows the new version

## 4. GitHub Release

Create a GitHub Release for the new tag.

Suggested title:

```text
v<next-version>
```

Suggested body:

```text
SPFR Figma Design Pipeline v<next-version>

Highlights:
- Published npm package: @spicefactory/figma-design-pipeline
- Trusted publishing via GitHub Actions
- Safe Figma mutation and token-sync workflow through a local MCP bridge

Install or update:
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all

Docs:
https://spfr.github.io/figma-design-pipeline/

npm:
https://www.npmjs.com/package/@spicefactory/figma-design-pipeline
```

Recommended release assets:
- `dist/figma-design-pipeline.mcpb`
- `dist/spfr-figma-plugin-community.zip`

## 5. Figma Community Submission

Build the plugin bundle:

```bash
npm run build:plugin
npm run build:figma-community
```

Use these prepared files:
- `community/listing.md`
- `community/privacy.md`
- `community/submission-checklist.md`

In Figma desktop:
1. Import `dist/plugin/manifest.json`
2. Smoke-test the plugin
3. Open the developer publish flow
4. Paste the prepared listing and privacy text
5. Submit for Community review

Keep the listing explicit that:
- the plugin works with a local MCP server
- it connects only to `127.0.0.1`
- read-only inspection and planning can work without the plugin
- mutations and token sync require the plugin plus the local MCP install

## 6. Update Story

For end users, update is the same as install:

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

Distribution model:
- Figma plugin updates ship through the Figma Community listing
- CLI and desktop MCP updates ship through the npm package
- The installer should be safe to rerun
