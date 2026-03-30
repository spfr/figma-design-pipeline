# Release Hardening

Use this checklist before making the repository public or cutting a release.

## Secret Review

- Confirm there are no real API keys, access tokens, cookies, or credentials in the repo.
- Confirm no `.env*`, private key, certificate, or provisioning files are tracked.
- Confirm issue templates, docs, and examples use placeholder values only.
- Confirm logs pasted into docs or examples are redacted.

## Repo Hygiene

- Review `.gitignore` for local state, build output, tarballs, and environment files.
- Confirm generated registries are not committed unless they are intentional public fixtures.
- Confirm no local absolute paths remain in documentation or scripts intended for users.

## Public Package Review

- Run `npm run check`
- Run `npm test`
- Run `npm pack`
- Inspect the tarball contents to confirm only intended files are shipped

## Docs Review

- Verify the GitHub Pages landing page still matches the current install flow.
- Verify `README.md`, `PUBLISHING.md`, and `SECURITY.md` agree on install and security guidance.
- Verify all client install commands use generic placeholders and not internal project names.
