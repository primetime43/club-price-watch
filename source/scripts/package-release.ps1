param([Parameter(Mandatory = $true)][string]$Tag)
$ErrorActionPreference = 'Stop'
if ($Tag -notmatch '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { throw 'Invalid release tag.' }
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$stage = Join-Path $workspace ('source/.build/release-stage-' + [guid]::NewGuid().ToString('N'))
$assets = Join-Path $workspace "source/.build/release-assets/$Tag"
# Create unique staging paths; never delete or move an installation directory.
if (Test-Path -LiteralPath $assets) { throw 'Release assets already exist; use a fresh build workspace.' }
New-Item -ItemType Directory -Path $stage, $assets | Out-Null
$windows = Join-Path $stage 'windows'
New-Item -ItemType Directory -Path $windows | Out-Null

# Export only selected committed sources. Untracked files, ignored state and .git
# never enter the archive. Do not copy the checkout or checker/package wholesale.
$paths = @(
  'Start Club Price Watch.bat', 'README.md', 'LICENSE', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'PUBLIC_RELEASE.md',
  'checker/package/README.txt',
  'checker/package/tools/Run Price Check Now.cmd', 'checker/package/tools/Setup Browser Extension.cmd',
  'checker/package/tools/Sign in to BJs.cmd', 'checker/package/tools/Test Signed-in Prices.cmd',
  'source/app', 'source/core', 'source/db', 'source/drizzle', 'source/extension', 'source/public',
  'source/checker', 'source/scripts', 'source/server', 'source/tests', 'source/worker',
  'source/docker', 'source/docs', 'source/screenshots', 'source/README.md', 'source/ARCHITECTURE.md',
  'source/package.json', 'source/package-lock.json', 'source/global.json', 'source/tsconfig.json',
  'source/vite.config.ts', 'source/next.config.ts', 'source/drizzle.config.ts', 'source/eslint.config.ts',
  'source/compose.yaml', 'source/.gitignore', 'source/.dockerignore'
)
# Reject accidentally committed runtime data and symlinks before extracting.
$entries = & git -C $workspace ls-tree -r HEAD -- @paths
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect release sources.' }
foreach ($entry in $entries) {
  $name = ($entry -split "`t", 2)[1]
  if ($entry.StartsWith('120000 ') -or $name -match '(^|/)(\.env[^/]*|\.wrangler|\.build|node_modules|profiles|captures|logs|data|bin|obj|dist|\.next)(/|$)|\.(sqlite[^/]*|db|har|pfx|p12|pem|csv)$|(^|/)(backup[^/]*|club-price-watch-[^/]*)\.json$') {
    throw 'Release sources contain a prohibited runtime file or symbolic link.'
  }
}
$archive = Join-Path $stage 'tracked-source.tar'
& git -C $workspace archive --format=tar "--output=$archive" HEAD -- @paths
if ($LASTEXITCODE -ne 0) { throw 'Could not export committed release sources.' }
& tar -xf $archive -C $windows
if ($LASTEXITCODE -ne 0) { throw 'Could not extract release sources.' }

function Copy-ReleaseFile([string]$RelativePath) {
  $inputFile = Join-Path $workspace $RelativePath
  if ((Get-Item -LiteralPath $inputFile).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Generated files must not be symbolic links.' }
  $destination = Join-Path $windows $RelativePath
  [IO.Directory]::CreateDirectory((Split-Path $destination)) | Out-Null
  Copy-Item -LiteralPath $inputFile -Destination $destination
}
$extensionFiles = @(
  'manifest.json', 'page-hook.js', 'bridge.js', 'site-bridge.js', 'site-worker.js',
  'runner.js', 'popup.js', 'order-picker.js', 'settings.js',
  'popup.html', 'runner.html', 'settings.html', 'style.css',
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png'
)
$manifest = Get-Content -LiteralPath (Join-Path $workspace 'checker/package/BrowserExtension/manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne $Tag.Substring(1)) { throw 'Built extension version differs from the release tag.' }
foreach ($file in $extensionFiles) { Copy-ReleaseFile "checker/package/BrowserExtension/$file" }
foreach ($file in @('ClubPriceWatch.Checker.exe', 'ClubPriceWatch.Checker.dll', 'ClubPriceWatch.Checker.deps.json', 'ClubPriceWatch.Checker.runtimeconfig.json', 'launcher.json')) {
  Copy-ReleaseFile "checker/package/tools/$file"
}
Copy-ReleaseFile 'checker/package/Start Club Price Watch.bat'

$windowsZip = Join-Path $assets "club-price-watch-$Tag-windows-x64.zip"
$extensionZip = Join-Path $assets "club-price-watch-$Tag-extension.zip"
Compress-Archive -Path (Join-Path $windows '*') -DestinationPath $windowsZip
Compress-Archive -LiteralPath (Join-Path $windows 'checker/package/BrowserExtension') -DestinationPath $extensionZip
$checksums = foreach ($zip in @($windowsZip, $extensionZip)) {
  $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $([IO.Path]::GetFileName($zip))"
}
[IO.File]::WriteAllLines((Join-Path $assets 'SHA256SUMS.txt'), [string[]]$checksums)
Write-Output "Release assets ready in $assets"
