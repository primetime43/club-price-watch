import { resolve, dirname, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { realpath } from "node:fs/promises";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const WORKSPACE_ROOT = resolve(ROOT, "..");
export const EXTENSION_OUTPUT = resolve(WORKSPACE_ROOT, "checker/package/BrowserExtension");
export const NATIVE_OUTPUT = resolve(WORKSPACE_ROOT, "checker/package/tools");
export async function assertWorkspaceOutput(target: string, root = WORKSPACE_ROOT): Promise<string> {
  const base = await realpath(root);
  const requested = resolve(target);
  let actual: string;
  let ancestor = requested;
  const missing: string[] = [];
  while (true) {
    try { actual = resolve(await realpath(ancestor), ...missing); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(ancestor) === ancestor) throw error;
      missing.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
  if (!actual.startsWith(base + sep) || actual === base) throw new Error("Build output must stay inside the project directory.");
  return actual;
}
