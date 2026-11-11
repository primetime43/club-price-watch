import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { ROOT } from "../scripts/paths.ts";
import { APP } from "../core/config.ts";

test("release tags must match source versions and reject malformed or prerelease tags", () => {
  const verify = (tag: string) => spawnSync(process.execPath, ["--experimental-strip-types", "scripts/verify-release.ts", tag], { cwd: ROOT, encoding: "utf8" });
  assert.equal(verify(`v${APP.version}`).status, 0);
  for (const tag of ["v0.0.0", APP.version, `v${APP.version}-beta.1`, "v02.2.0", "v2.2.0/extra"]) {
    assert.notEqual(verify(tag).status, 0, tag);
  }
});

test("release packages exclude untracked state and unexpected generated files, reject overwrites and committed runtime data", { skip: process.platform !== "win32" }, async () => {
  const base = resolve(ROOT, ".build");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(resolve(base, "release-test-"));
  const script = await readFile(resolve(ROOT, "scripts/package-release.ps1"), "utf8");
  const run = (command: string, args: string[]) => spawnSync(command, args, { cwd: workspace, encoding: "utf8" });
  const git = (...args: string[]) => {
    const result = run("git", args);
    assert.equal(result.status, 0, result.stderr);
  };
  const put = async (name: string, contents = "synthetic fixture") => {
    const path = resolve(workspace, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  };
  try {
    // Populate the source allowlist with synthetic files, without copying any user data.
    const paths = script.match(/\$paths = @\(([\s\S]*?)\n\)/)![1].matchAll(/'([^']+)'/g);
    for (const [, path] of paths) await put(/\.[^/]+$/.test(path) || path.endsWith("LICENSE") ? path : `${path}/fixture.txt`);
    await put("source/scripts/package-release.ps1", script);
    git("init", "-q");
    git("add", ".");
    git("-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "commit", "-qm", "Synthetic release fixture");
    const generated = script.match(/\$extensionFiles = @\(([\s\S]*?)\n\)/)![1].matchAll(/'([^']+)'/g);
    for (const [, file] of generated) await put(`checker/package/BrowserExtension/${file}`);
    await put("checker/package/BrowserExtension/manifest.json", JSON.stringify({ version: "1.2.3" }));
    for (const file of ["ClubPriceWatch.Checker.exe", "ClubPriceWatch.Checker.dll", "ClubPriceWatch.Checker.deps.json", "ClubPriceWatch.Checker.runtimeconfig.json", "launcher.json"]) await put(`checker/package/tools/${file}`);
    await put("checker/package/Start Club Price Watch.bat");
    for (const file of ["source/.wrangler/state/synthetic.db", "source/core/.env", "source/profiles/synthetic.txt", "checker/package/BrowserExtension/unexpected.txt", "checker/package/tools/unexpected.txt"]) await put(file);
    const pack = (tag: string) => run("pwsh", ["-NoProfile", "-NonInteractive", "-File", "source/scripts/package-release.ps1", "-Tag", tag]);
    const result = pack("v1.2.3");
    assert.equal(result.status, 0, result.stderr);
    const assets = resolve(workspace, "source/.build/release-assets/v1.2.3");
    const list = run("tar", ["-tf", resolve(assets, "club-price-watch-v1.2.3-windows-x64.zip")]);
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /Start Club Price Watch.bat/);
    assert.match(list.stdout, /BrowserExtension\/manifest.json/);
    assert.match(list.stdout, /ClubPriceWatch.Checker.exe/);
    assert.doesNotMatch(list.stdout, /\.wrangler|\.env|profiles|unexpected|Uninstall Weekly/);
    const extension = run("tar", ["-tf", resolve(assets, "club-price-watch-v1.2.3-extension.zip")]);
    assert.equal(extension.status, 0, extension.stderr);
    assert.match(extension.stdout, /BrowserExtension\/manifest.json/);
    assert.doesNotMatch(extension.stdout, /source\/|unexpected/);
    assert.equal((await readFile(resolve(assets, "SHA256SUMS.txt"), "utf8")).trim().split(/\r?\n/).length, 2);
    assert.notEqual(pack("v1.2.3").status, 0, "existing assets must not be overwritten");
    git("add", "source/core/.env");
    git("-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "commit", "-qm", "Synthetic prohibited file");
    const rejected = pack("v1.2.4");
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /prohibited runtime file/);
  } finally {
    assert.ok(workspace.startsWith(base + sep));
    await rm(workspace, { recursive: true, force: true });
  }
});
