import { readFile } from "node:fs/promises";
import { APP } from "../core/config.ts";
import { extensionManifest } from "../extension/manifest.ts";

const tag = process.argv[2];
if (!tag || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
  throw new Error("Use a stable version tag such as v2.2.1.");
}
const version = tag.slice(1);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const versions = [APP.version, pkg.version, lock.version, lock.packages?.[""]?.version, extensionManifest("").version];
if (versions.some(value => value !== version)) throw new Error("Tag, shared app/extension version, package.json and package-lock.json must match.");
if (version.split(".").some(part => Number(part) > 65535)) throw new Error("Version components must fit the extension manifest version limits.");
console.log(`Verified release ${tag}.`);
