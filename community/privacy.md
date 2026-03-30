# Privacy

SPFR Figma Design Pipeline runs locally on the user's machine.

## Data flow

- The plugin operates on the currently opened Figma file through the official Figma Plugin API.
- For write workflows, the plugin connects to a local bridge on `127.0.0.1`.
- The MCP server uses the user's own Figma access token for read-only REST API requests.

## Data collection

- The workflow runs locally on the user's machine.
- The plugin is not designed to send file data to a hosted SPFR service.
- Any external data handling depends on the AI client and local environment chosen by the user.

## User responsibility

Users should review the MCP server configuration in their AI client and protect their own Figma access tokens and local machine access.
