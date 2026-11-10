# Development

Run npm commands here. Node.js >=22.13 is required; Docker uses Node 24.
Full Windows release needs the .NET 8 SDK in global.json.
Clubs come from recorded item locations. No source-level store configuration is required.

```sh
npm ci
npm run check
npm run release
```

- **typecheck:** strict TypeScript compilation.
- **test:** synthetic TypeScript tests and disposable SQLite databases.
- **build:** app only.
- **build:extension:** browser extension/config, no .NET SDK needed.
- **release:** checks, native tests, Windows launcher, extension and app.
- **build:docker:** production container app, no Windows/.NET build.

The root batch prepares migrations and starts the app. Preserve .wrangler/state/;
never rename an existing installation’s database name/ID as cleanup.
Outputs go to ../checker/package/BrowserExtension/ and ../checker/package/tools/.
Keep an already-loaded extension at its original absolute path. Reload after builds
and refresh app/product/order pages.

See [architecture](ARCHITECTURE.md) and [Docker](docker/README.md). There is no hosted
web-app publishing integration. Container publication is manual-only, never automatic
on a normal push.
