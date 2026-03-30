# Changelog

All notable changes to SPFR Figma Design Pipeline will be documented in this file.

## [0.5.0] - 2026-03-30

### Added
- Standalone public package structure for `@spfr/figma-design-pipeline`
- Cross-client installer for Claude, Gemini, Codex, and Claude Desktop
- Claude Desktop `.mcpb` packaging
- Figma Community submission bundle and listing assets
- GitHub Pages landing page and release-hardening docs
- On-demand workflow MCP resources for inspect, mutate, tokens, and codegen

### Changed
- Promoted the project from a multi-skill repo layout to a dedicated Figma pipeline package
- Reduced default skill context footprint by moving detailed guidance to MCP resources
- Made the server bundle self-contained for package installs
- Updated naming to `SPFR Figma Design Pipeline` and plugin id `co.spfr.figma-design-pipeline`

### Removed
- Legacy multi-skill repo content unrelated to the Figma pipeline
