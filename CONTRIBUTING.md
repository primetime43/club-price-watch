# Contributing

Use Node.js >=22.13 and work in source/. Run npm ci, npm run check and relevant builds.
Full Windows release additionally needs .NET 8 SDK. Follow [AGENTS.md](AGENTS.md).

Use synthetic fixtures. Never commit databases/backups, account/order screenshots,
profiles, captures, credentials, logs or container data. Report sanitized shapes,
status codes and public messages; redact private hostnames and machine paths.

Keep migrations compatible, extension identity stable and live checks opt-in. Do not
add automatic image publication. Explain changes and meaningful validation in PRs.
Use a GitHub no-reply commit email to keep an email address out of public metadata.
