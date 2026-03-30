# Release Checklist

Use this checklist for every public release of SPFR Figma Design Pipeline.

## 1. Local Verification

Run from the repo root:

```bash
npm ci
npm run check
npm test
npm run build
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

## 2. Smoke Test

Install on your real machine:

```bash
cd /tmp
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

All major CLIs (Claude Code, Codex, Gemini) support the official Figma MCP via OAuth — no token needed for Figma reads and writes.

- Confirm `figma-design-pipeline` is registered as an MCP server
- Run `figma_get_tree` with a Figma URL
- Run `figma_audit`
- Use the official Figma MCP's `use_figma` to create a simple frame

To also test REST API tools, set:

```bash
export FIGMA_ACCESS_TOKEN=figd_...
```

- Run `figma_extract_tokens`
- Run `figma_get_styles`

## 3. npm Release

The package is published through GitHub Actions trusted publishing.

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

Suggested body:

```text
SPFR Figma Design Pipeline v<next-version>

AI design assistant for Figma — analyze websites, create design systems,
design pages, sync tokens, and generate code from your terminal.

Install or update:
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all

Docs: https://spfr.github.io/figma-design-pipeline/
npm: https://www.npmjs.com/package/@spicefactory/figma-design-pipeline
```

## 5. Update Story

For end users, update is the same as install:

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```
