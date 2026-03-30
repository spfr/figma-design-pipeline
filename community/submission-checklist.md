# Figma Community Submission Checklist

1. Run:

```bash
npm run build:plugin
npm run build:figma-community
```

2. Import `dist/plugin/manifest.json` into Figma desktop and smoke-test:
- plugin starts
- plugin reconnects after restart
- plugin can connect to the local bridge

3. Review `listing.md` and `privacy.md` for final wording.

4. In Figma desktop:
- open the imported plugin
- use the Community publish flow
- upload listing assets as needed
- paste the listing and privacy text from this bundle

5. Keep the plugin description explicit that:
- it works with a local MCP server
- it connects only to localhost
- it is most useful alongside the npm package
