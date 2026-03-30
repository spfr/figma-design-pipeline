# Security Policy

## Credential Handling

This project requires API tokens to function. Follow these rules to keep them safe:

### Where to Store Tokens

**Do:** Pass tokens via your MCP client's environment configuration.

```json
{
  "mcpServers": {
    "figma-design-pipeline": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "figd_your_token_here"
      }
    }
  }
}
```

Common MCP config locations:
- **Claude Code**: `.mcp.json` (project) or `~/.claude/mcp.json` (global)
- **Cursor**: `.cursor/mcp.json` or Settings > MCP Servers
- **Windsurf**: `~/.codeium/windsurf/mcp_config.json`
- **Cline**: `cline_mcp_settings.json`

**Don't:**
- Commit `.env` files with real tokens
- Hardcode tokens in source code
- Share tokens in GitHub Issues or PRs
- Store tokens in skill SKILL.md files

### Token Scopes

The Figma personal access token needs **File content** read access. If you use mutation tools (plugin), it also needs to be from an account with edit access to the target Figma file.

Generate tokens at: https://www.figma.com/developers/api#access-tokens

### Revoking Compromised Tokens

If a token is accidentally exposed:
1. Go to Figma > Account Settings > Personal Access Tokens
2. Delete the compromised token immediately
3. Generate a new token
4. Update your MCP client configuration

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub Issue
2. Email the maintainers directly (see repo owner profile)
3. Include steps to reproduce the issue
4. Allow reasonable time for a fix before public disclosure

## Open Source Release Checklist

Before making the repo public or publishing a release:

1. Run a repo-wide secret scan for tokens, credentials, and private keys
2. Verify `.env*` and other local config files are ignored and untracked
3. Inspect package tarballs before publish to confirm only intended files ship
4. Redact tokens from logs, screenshots, and issue reports
5. Review [docs/RELEASE-HARDENING.md](docs/RELEASE-HARDENING.md)

## Figma Plugin Security

The Figma plugin communicates with the MCP server via a local WebSocket connection (`127.0.0.1`). This is intentionally localhost-only — the bridge does not accept remote connections.

The plugin runs inside Figma's sandboxed environment and can only access the current file's scene graph through the official Plugin API.
