import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, assertWorkspaceOutput } from "../scripts/paths.ts";
import { APP } from "../core/config.ts";
import { extensionManifest } from "../extension/manifest.ts";

test("extension public key, identity, version and permissions stay consistent", async () => {
  const key = (await readFile(resolve(ROOT, "extension/public-key.txt"), "utf8")).trim();
  const id = [...createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16)]
    .map(value => String.fromCharCode(97 + (value >> 4), 97 + (value & 15))).join("");
  assert.equal(id, APP.extensionId);
  const manifest = extensionManifest(key);
  assert.equal(manifest.version, APP.version);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.optional_permissions, ["scripting"]);
  assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(manifest.options_page, "settings.html");
  assert.equal(manifest.externally_connectable, undefined);
});

test("recursive build output cannot resolve outside its intended root", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "cpw-test-"));
  try {
    await assert.rejects(assertWorkspaceOutput(resolve(root, ".."), root), /inside/);
    assert.equal(await assertWorkspaceOutput(resolve(root, "missing/output"), root), resolve(await realpath(root), "missing/output"));
    const path = resolve(root, "generated");
    await mkdir(path);
    assert.equal(await assertWorkspaceOutput(path, root), await realpath(path));
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("cpw-test-"));
    await rm(root, { recursive: true, force: true });
  }
});
