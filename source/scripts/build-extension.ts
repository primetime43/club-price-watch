import { build } from "vite";
import { copyFile, readFile, readdir, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { APP } from "../core/config.ts";
import { runnerUrl } from "../core/protocol.ts";
import { extensionManifest } from "../extension/manifest.ts";
import { ROOT, WORKSPACE_ROOT, EXTENSION_OUTPUT, NATIVE_OUTPUT, assertWorkspaceOutput } from "./paths.ts";

export async function buildExtension(): Promise<void> {
  await mkdir(EXTENSION_OUTPUT, { recursive: true });
  await assertWorkspaceOutput(EXTENSION_OUTPUT);
  await rm(EXTENSION_OUTPUT, { recursive: true, force: true });
  await mkdir(EXTENSION_OUTPUT, { recursive: true });
  await mkdir(resolve(EXTENSION_OUTPUT, "icons"), { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await copyFile(resolve(ROOT, `extension/assets/icon-${size}.png`), resolve(EXTENSION_OUTPUT, `icons/icon-${size}.png`));
  }
  const entries = { "page-hook": "page-hook", bridge: "bridge", "site-bridge": "site-bridge", "site-worker": "background", runner: "runner", popup: "popup", "order-picker": "order-picker", settings: "settings" };
  for (const [output, input] of Object.entries(entries)) {
    await build({ configFile: false, root: ROOT, logLevel: "warn", publicDir: false,
      build: { outDir: EXTENSION_OUTPUT, emptyOutDir: false, minify: false, sourcemap: false, target: "chrome120",
        lib: { entry: resolve(ROOT, `extension/src/${input}.ts`), name: "ClubPriceWatch", formats: ["iife"], fileName: () => `${output}.js` } } });
  }
  for (const name of await readdir(resolve(ROOT, "extension/ui"))) {
    const contents = (await readFile(resolve(ROOT, "extension/ui", name), "utf8"))
      .replaceAll("__APP_VERSION__", APP.version).replaceAll("__SITE_ORIGIN__", APP.siteOrigin).replaceAll("__BJS_HOME__", APP.bjsHome);
    await writeFile(resolve(EXTENSION_OUTPUT, name), contents);
  }
  const key = (await readFile(resolve(ROOT, "extension/public-key.txt"), "utf8")).trim();
  const id = [...createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16)]
    .map(value => String.fromCharCode(97 + (value >> 4), 97 + (value & 15))).join("");
  if (id !== APP.extensionId) throw new Error("The extension public key does not match its stable ID.");
  await writeFile(resolve(EXTENSION_OUTPUT, "manifest.json"), JSON.stringify(extensionManifest(key), null, 2) + "\n");
  const check = runnerUrl(); check.searchParams.set("mode", "check");
  const test = runnerUrl(); test.searchParams.set("mode", "test");
  await mkdir(NATIVE_OUTPUT, { recursive: true });
  await writeFile(resolve(NATIVE_OUTPUT, "launcher.json"), JSON.stringify({ checkUrl: check.href, testUrl: test.href, signInUrl: APP.bjsHome, setupUrl: "chrome://extensions/" }, null, 2) + "\n");
  await writeFile(resolve(WORKSPACE_ROOT, "checker/package/Start Club Price Watch.bat"), `@echo off\r\ncall "%~dp0..\\..\\Start Club Price Watch.bat" %*\r\n`);
  await rm(resolve(WORKSPACE_ROOT, "checker/package/Start Club Price Watch.url"), { force: true });
  console.log(`Built TypeScript extension ${APP.version}.`);
}
