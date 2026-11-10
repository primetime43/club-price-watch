import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT } from "./paths.ts";
import { APP } from "../core/config.ts";

async function ready(): Promise<boolean> {
  try {
    const response = await fetch(`${APP.siteOrigin}/api/items`, { signal: AbortSignal.timeout(1500) });
    const data = await response.json() as { items?: unknown };
    return response.ok && Array.isArray(data.items);
  } catch { return false; }
}
function openApp(): void {
  if (process.argv.includes("--no-browser")) return;
  // Windows opens only the URL in the user's default browser.
  spawn("rundll32.exe", ["url.dll,FileProtocolHandler", APP.siteOrigin + "/"], { stdio: "ignore" }).unref();
}
if (await ready()) {
  openApp();
  console.log("Club Price Watch is already running.");
} else {
  if (!existsSync(resolve(ROOT, "node_modules/vinext/dist/cli.js"))) {
    throw new Error("Dependencies are missing. Run npm ci in this folder, then start again.");
  }
  await mkdir(resolve(ROOT, ".build"), { recursive: true });
  const config = resolve(ROOT, ".build/local-wrangler.json");
  await writeFile(config, JSON.stringify({
    name: "club-price-watch-local", compatibility_date: "2026-11-08",
    d1_databases: [{ binding: "DB", database_name: "site-creator-d1",
      database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: resolve(ROOT, "drizzle") }],
  }));
  const env = { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" };
  const migration = spawnSync(process.execPath, [resolve(ROOT, "node_modules/wrangler/bin/wrangler.js"),
    "d1", "migrations", "apply", "DB", "--local", "--config", config,
    "--persist-to", resolve(ROOT, ".wrangler/state")], { cwd: ROOT, stdio: "inherit", env });
  if (migration.error || migration.status !== 0) throw new Error("Could not prepare the local database.");
  const server = spawn(process.execPath, [resolve(ROOT, "node_modules/vinext/dist/cli.js"), "dev", "--port", "3000", "--strictPort"],
    { cwd: ROOT, stdio: "inherit", env });
  let exited = false;
  server.on("exit", code => { exited = true; process.exitCode = code ?? 1; });
  server.on("error", error => { exited = true; console.error(error.message); process.exitCode = 1; });
  process.on("SIGINT", () => server.kill());
  let available = false;
  for (let attempt = 0; attempt < 90 && !exited; attempt++) {
    if (await ready()) { available = true; break; }
    await new Promise(done => setTimeout(done, 1000));
  }
  if (available) {
    console.log("Club Price Watch is ready. Keep this window open while using the app.");
    openApp();
  } else {
    server.kill();
    throw new Error("The local app could not start. Review the error above; port 3000 may already be in use.");
  }
}
