# Publishing

This package is designed to be publishable in two channels:

1. **npm package** for the MCP server, installer, skill bundle, and Claude Desktop bundle
2. **Figma Community plugin** for easy discovery and install inside Figma

## npm

Recommendation: publish the public package to **npmjs.com**, not only GitHub Packages.

Why:

- npm is the default install source for `npx` and `npm install`
- public CLI discoverability is much better on npm
- trusted publishing with GitHub Actions is officially supported by npm
- GitHub Packages is better as an internal mirror than as the primary public distribution point
- GitHub Packages adds registry and auth friction that weakens the one-line install story

The package is self-contained:

- `dist/index.js` is a standalone MCP server bundle
- `dist/plugin/` contains the Figma plugin
- `dist/figma-design-pipeline.mcpb` contains the Claude Desktop bundle
- `skill/` contains the bundled skill used by installers

Before publishing:

```bash
npm install
npm run check
npm test
npm pack
```

Set up npm publishing with **trusted publishing** on npmjs.com for the GitHub repo/workflow instead of storing a long-lived publish token in GitHub. The workflow in `.github/workflows/publish-npm.yml` is already prepared for that model.

`prepack` already runs:

```bash
npm run build
npm run build:desktop
```

Recommended public install command after publish:

```bash
npx -y -p @spfr/figma-design-pipeline spfr-figma-design-pipeline-install --client all
```

Temporary fallback while npm is unavailable:

```bash
npx -y -p https://github.com/spfr/figma-design-pipeline/releases/download/figma-design-pipeline-v0.5.0/spfr-figma-design-pipeline-0.5.0.tgz spfr-figma-design-pipeline-install --client all
```

Suggested release trigger:

- create and push a tag like `figma-design-pipeline-v0.5.0`
- GitHub Actions publishes the package from the repo root

## Figma Community Plugin

The plugin can be published separately in the Figma Community so users can find and install it from Figma.

Recommended listing language:

- This plugin is the **Figma-side executor** for SPFR Figma Design Pipeline.
- Read-only REST-based inspection and planning work without the plugin.
- Mutations and local style sync require the plugin plus the local MCP server.
- The plugin connects only to a local bridge on `127.0.0.1` and does not require a hosted backend.

### Publish Checklist

1. Build the plugin:

```bash
npm run build:plugin
npm run build:figma-community
```

2. Import `dist/plugin/manifest.json` into the Figma desktop app.
3. Review the generated submission bundle:
- `dist/figma-community-submission/`
- `dist/spfr-figma-plugin-community.zip`
3. Add plugin listing metadata in Figma:
- clear description of the local bridge requirement
- setup link back to this package README
- support contact and privacy disclosures appropriate for review
4. Submit for Community review from Figma desktop.

### Review-Sensitive Points

- The manifest now declares `documentAccess: "dynamic-page"`.
- The manifest declares explicit localhost WebSocket access for the bridge ports used by the plugin.
- The plugin description should explicitly say that it connects to a local MCP bridge running on the user's own machine.

## Limitation

The Figma Community plugin can be made easy to discover and install, but it still cannot fully replace the local MCP server install. The clean UX is:

1. Install the Figma plugin from Community
2. Run the one-line package installer for Claude, Gemini, or Codex
3. Start using the pipeline immediately
