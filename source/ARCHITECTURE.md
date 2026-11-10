# Architecture

Windows startup applies local D1 migrations and runs Vinext at localhost:3000, with data
in .wrangler/state/. Docker aliases the binding to server/container-env.ts and uses Node
SQLite with persistent /data. Keep database name/ID stable for existing installations.

The extension uses the normal signed-in Chromium browser. Server address chooses an exact
app origin; optional host access registers the bridge there. It never exports profiles or
cookies. The server is not an unattended checking bot.

## Modules

- core/: config, models, validation, sole price parser, protocol, checks and insights.
- app/: React views/modals and thin API routes.
- db/, drizzle/: transactions, history, merges/aliases and backup/restore.
- extension/src/, extension/ui/: popup, runner, order picker and browser bridge.
- worker/: local runtime; server/, docker/: production SQLite/runtime.
- checker/: minimal .NET 8 URL launcher; scripts/: startup/build containment.

## Data and checks

API dollars convert once to cents. Each history point retains date/source/club; unknown
locations are not inferred. Writes are atomic. Archive/metadata/shopping edits do not
start checks. Merge combines history, deduplicates identical purchases and remembers links.
V4 backups include aliases/full history without internal IDs; v1-v3 import. History details,
backups and overview bypass the watchlist’s 60-record cap.

Checks serialize with Web Locks and owned nonce-marked product tabs. The parser checks
club/visibility/status and positive amounts. Dry runs never write; failures preserve good
prices. Only owned successful unchanged tabs close. Messages are validated, jobs have
deadlines, and visible watchlists refresh every five seconds/on focus.

APIs have no application-level authentication. Public hosting and automatic scheduling
are absent. Container publication is manual-only. No CDP/dedicated profiles are used.
npm run check runs strict compilation/synthetic/SQLite tests; full release also runs native
checks and builds Windows tools, extension and app. Linux amd64 execution is verified;
ARM and live authenticated browser behavior need separate testing.
