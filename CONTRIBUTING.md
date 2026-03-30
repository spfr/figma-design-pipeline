# Contributing

Thanks for contributing to SPFR Figma Design Pipeline.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

Useful additional commands:

```bash
npm run build:desktop
npm run build:figma-community
npm run install:clients
```

## Before Opening a PR

1. Run type checks and tests.
2. If you changed packaging or release behavior, run `npm pack`.
3. If you changed the plugin, smoke-test it in Figma desktop.
4. If you changed install docs or release docs, verify `README.md`, `PUBLISHING.md`, and `SECURITY.md` still agree.

## Scope

This repo is dedicated to the Figma MCP pipeline:

- MCP server and tool definitions
- Figma plugin
- Installers for Claude, Gemini, Codex, and Claude Desktop
- Figma Community submission assets

Avoid reintroducing unrelated generic skill-repo infrastructure.
