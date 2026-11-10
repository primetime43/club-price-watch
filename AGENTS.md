# Contributor and agent instructions

## Preserve user data and installation identity

- Develop in source/; root batch is the Windows entry point.
- Preserve source/.wrangler/state/, Docker data, source/db/ and source/drizzle/.
- Never move an already-loaded checker/package/BrowserExtension/ directory.
- Never read, print, commit or package profiles, cookies, passwords, account/order IDs,
  authentication headers, session tokens or raw authenticated captures.
- Do not automatically sign in, alter schedules or run retired cleanup tools.
- APIs lack application-level authorization. Origin checks are not authentication.
- Hosted web-app publishing stays disconnected. Container publication is manual-only;
  publish only on explicit request, never on ordinary pushes.

## Responsibilities

- core/config.ts: origin, club, stable extension identity, versions and deadlines.
- core/prices.ts: sole price parser. core/items.ts: models/validation.
- core/api.ts: client; checks.ts: execution; protocol.ts: validated messages.
- core/overview.ts: full-history same-club calculations; unknown locations stay unknown.
- app/: React/thin routes. db/, drizzle/: guarded persistence and migrations.
- extension/src/, extension/ui/: browser adapters/controllers and static UI.
- checker/: minimal .NET 8 URL launcher; no API, parser, profiles or CDP.
- server/, docker/: production SQLite. scripts/: startup/build containment.

## Browser and price rules

Use the usual default browser and BJ’s login. Pass URLs only, without special profiles,
headless/debugging flags or CDP. Instrument only owned nonce-marked product tabs.
Never bypass 403; the user completes verification directly on BJ’s. Preserve failed,
existing and user-navigated tabs. Dry runs never save; failures retain good prices.

Match club ID and normalize leading zeroes. Reject hidden/invalid/nonpositive prices.
Prefer a positive in-club offer amount, then standard club price. A discount is never
the price. Use the long URL product ID, not SKU. Anonymous metadata/page text cannot
prove an authenticated current club price.

Order import reads only product anchors, labelled unit-price cells, bounded Order Date
and public Pick Up Location values. Do not collect whole rows/body text, customer/shipping
details or order network traffic. Review before saving selected fields. Public club
lookup verifies locator/detail data and fails closed. Provenance uses clubId/clubName.

## Persistence and verification

Keep existing database name/ID consistent. No identifying location defaults in schema
or migrations. Metadata/archive/shopping edits and merges preserve observed prices/history
except as explicitly scoped. Dependent writes use D1 batch transactions. Aliases prevent
merged products being recreated. Backups retain full history/links without internal IDs.

Generate browser JS from TypeScript; never edit bundles or add ZIP/source-download UI.
Run npm run check and relevant builds, using synthetic fixtures/disposable databases.
A successful build/opened tab is not proof of authenticated checking. State unverified
browser flows. Full Windows release also needs .NET 8 SDK.
