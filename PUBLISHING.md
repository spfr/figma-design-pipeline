# Publishing

This package is published on **npmjs.com** as `@spicefactory/figma-design-pipeline`.

## npm

The package is self-contained:

- `dist/index.js` is a standalone MCP server bundle
- `skill/` contains the design assistant skill

Before publishing:

```bash
npm install
npm run check
npm test
npm pack
```

### npm Trusted Publisher Setup

In npm, configure a trusted publisher for this package with these values:

- npm package: `@spicefactory/figma-design-pipeline`
- GitHub owner: `spfr`
- GitHub repository: `figma-design-pipeline`
- Workflow file: `.github/workflows/publish-npm.yml`
- Trigger: tag push or manual workflow dispatch

The GitHub workflow is already configured with:

- `permissions.id-token: write`
- `actions/setup-node` pointed at `https://registry.npmjs.org`
- `npm publish --provenance --access public`

### Release Trigger

Create and push a tag:

```bash
git tag figma-design-pipeline-v0.6.0
git push origin figma-design-pipeline-v0.6.0
```

`prepack` runs `npm run build` automatically.

### Install Command

```bash
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

Important: test that command from outside this repository.

### Release Verification

```bash
cd /tmp
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --help
```

Then test a clean-home install:

```bash
TMP_HOME="$(mktemp -d)"
cd /tmp
HOME="$TMP_HOME" npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```
