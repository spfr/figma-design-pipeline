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

6. After the plugin is approved, publish updates from the same Figma developer flow so existing Community installs receive the latest plugin version.

7. After each plugin update, rerun the public npm installer from outside the repo to verify the local MCP side still matches the Community plugin:

```bash
cd /tmp
npx -y -p @spicefactory/figma-design-pipeline spfr-figma-design-pipeline-install --client all --help
```
