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

## Version releases

Update `core/config.ts` (`APP.version`), `package.json` and both version fields in
`package-lock.json` together. Commit the change, then push a matching stable tag
such as `v2.2.1`. The **Draft version release** workflow verifies those versions,
runs all checks and the .NET 8/Windows release build, then creates a draft GitHub
Release with Windows x64 and extension ZIPs, SHA-256 checksums and generated notes.
Review the draft and publish it from GitHub Releases. Prerelease tags are not supported.

The Windows ZIP includes selected committed sources and generated binaries; first
startup still needs Node.js/npm and internet access to install dependencies. The
optional native launcher needs .NET 8 Runtime. Extract to a permanent location before
loading the extension, and keep existing database and extension paths when upgrading.
The extension ZIP contains `BrowserExtension/` for **Load unpacked**; it is not a
Chrome Web Store publication. Neither workflow publishes the hosted website, and
Docker images remain manual-only. An existing GitHub Release is never overwritten;
if creation partially fails, inspect its draft before retrying.
