# Docker / Synology

Configure ../core/config.ts before building. The source ships example club settings and
does not assume a pre-published registry image. From source/:

```sh
docker compose up -d --build
```

Docker uses Node 24 and production Vinext; no Windows EXE, .NET or browser profile is
included. Open http://YOUR-SERVER:3000. Only Linux amd64 execution has been verified.

For Synology Container Manager, copy the source directory excluding dependencies, build
output, local state and backups. Create a Project with compose.yaml. Restrict network
access: the API has no application-level authentication.

## Storage and updates

Compose mounts ./data:/data. Preserve it across updates. The database is
/data/club-price-watch.sqlite; migrations apply transactionally at startup. Use app backup,
or stop the container before copying the complete data directory. Never bake databases,
BJ’s sessions or browser profiles into an image.

To migrate hosts, use Backup & restore. Server address changes do not move data.
Preserve the old installation and its backups.

## Extension

Build the extension on the browsing PC and keep its loaded folder in place. Open Server
address, Save & connect to the server origin, allow permission, then refresh app and BJ’s
pages. Finish checks before switching. Server uptime is not an unattended checking schedule.

## Optional registry publication

The workflow .github/workflows/publish-container.yml is manual-only. After review and club
configuration, explicitly run Actions > Publish container > Run workflow on main. It checks,
builds and smoke-tests amd64 before publishing latest/sha tags to the repository’s own
namespace using its GITHUB_TOKEN. Never commit registry tokens.

No image is published for this public snapshot. Keep existing private repositories and
packages private. Package visibility is separate from repository visibility. Credentials
belong outside Compose and source control.
