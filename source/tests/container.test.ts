import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.ts";
import { openSqlite, migrateSqlite } from "../server/sqlite.ts";
import { addItem } from "../db/add-item.ts";
import { saveItemPrice } from "../db/save-price.ts";
import { setShoppingList } from "../db/shopping-list.ts";
import { setArchived } from "../db/archive.ts";
import { exportBackup } from "../db/backup.ts";
import { PRODUCT_URL } from "./fixtures.ts";
import { serverOrigin } from "../core/server-origin.ts";
import { isWatchlistUrl, APP } from "../core/config.ts";
import { getServerOrigin, serverScript } from "../extension/src/connection.ts";
import { runnerOptions } from "../extension/src/background.ts";
import { notifyWatchlist } from "../extension/src/site-results.ts";

const migrations = fileURLToPath(new URL("../drizzle", import.meta.url));
test("container SQLite migrates and reopens with exact prices/history, targets, archive and shopping state intact", async () => {
  const folder = mkdtempSync(resolve(tmpdir(), "cpw-container-"));
  let database: ReturnType<typeof openSqlite> | undefined;
  try {
    const filename = resolve(folder, "data/app.sqlite");
    database = openSqlite(filename, migrations);
    const db = drizzle(database.binding, { schema });
    const { item } = await addItem(db, { name: "Saved", url: PRODUCT_URL, currentPrice: 12.34, targetPrice: 10 });
    await saveItemPrice(db, item.id, 1199);
    await setShoppingList(db, item.id, true);
    await setArchived(db, item.id, true);
    const before = await exportBackup(db);
    database.close(); database = undefined;
    database = openSqlite(filename, migrations);
    const after = await exportBackup(drizzle(database.binding, { schema }));
    assert.deepEqual(after.items, before.items);
    assert.equal(after.items[0].history.length, 2);
  } finally {
    database?.close();
    assert.equal(dirname(folder), resolve(tmpdir()));
    rmSync(folder, { recursive: true, force: true });
  }
});

test("failed container migration rolls back its schema and journal entry", () => {
  const folder = mkdtempSync(resolve(tmpdir(), "cpw-migration-"));
  const sqlite = new DatabaseSync(":memory:");
  try {
    writeFileSync(resolve(folder, "0000_fail.sql"), "CREATE TABLE should_rollback (id TEXT); INSERT INTO missing_table VALUES (1);");
    assert.throws(() => migrateSqlite(sqlite, folder), /missing_table/);
    assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'should_rollback'").all(), []);
    assert.deepEqual(sqlite.prepare("SELECT * FROM cpw_migrations").all(), []);
  } finally { sqlite.close(); assert.equal(dirname(folder), resolve(tmpdir())); rmSync(folder, { recursive: true, force: true }); }
});

test("NAS addresses normalize without accepting credentials, paths, other schemes or wildcard origins", () => {
  assert.equal(serverOrigin(" http://192.168.1.20:3000/ "), "http://192.168.1.20:3000");
  assert.equal(serverOrigin("https://watch.example.test"), "https://watch.example.test");
  for (const value of ["nas:3000", "http://user:password@nas:3000", "http://nas/path", "http://nas/?x=1", "http://nas/#hash", "http://*.example.test", "chrome-extension://extension/", "file:///tmp", null]) assert.throws(() => serverOrigin(value));
  const script = serverScript("http://nas:3000");
  assert.deepEqual(script.matches, ["http://nas:3000/*"]);
  assert.equal(script.allFrames, false);
  assert.equal(script.persistAcrossSessions, true);
});

test("extension reads an explicit NAS address while localhost stays the default and identity stays fixed", async () => {
  const storage = (value: unknown) => ({ get: async () => value }) as unknown as Pick<chrome.storage.StorageArea, "get">;
  assert.equal(await getServerOrigin(storage({})), APP.siteOrigin);
  assert.equal(await getServerOrigin(storage({ serverOrigin: "http://nas:3000/" })), "http://nas:3000");
  await assert.rejects(getServerOrigin(storage({ serverOrigin: "https://nas/unsafe" })));
  assert.equal(isWatchlistUrl("http://nas:3000/", "http://nas:3000"), true);
  assert.equal(isWatchlistUrl("http://nas:3001/", "http://nas:3000"), false);
  assert.equal(isWatchlistUrl("http://nas:3000/other", "http://nas:3000"), false);
  assert.equal(isWatchlistUrl("http://nas:3000/"), false);
  const request = { type: "CPW_OPEN_RUNNER", requestId: "request", itemId: "one", run: true };
  const sender = { id: APP.extensionId, frameId: 0, url: "http://nas:3000/", tab: { id: 42 } };
  assert.ok(runnerOptions(request, sender, APP.extensionId, "http://nas:3000"));
  assert.equal(runnerOptions(request, sender, APP.extensionId), null);
  assert.equal(runnerOptions(request, { ...sender, frameId: 1 }, APP.extensionId, "http://nas:3000"), null);
});

test("NAS completion messages return only to the chosen app origin", async () => {
  const sent: number[] = [];
  let tabUrl = "http://nas:3000/";
  const browser = { tabs: { get: async () => ({ url: tabUrl }), sendMessage: async (id: number) => { sent.push(id); } } };
  const url = `chrome-extension://${APP.extensionId}/runner.html?requestId=request&sourceTab=42`;
  await notifyWatchlist([{ id: "one", status: "recorded" }], { url, browser, siteOrigin: "http://nas:3000" });
  tabUrl = APP.siteOrigin;
  await notifyWatchlist([{ id: "one", status: "recorded" }], { url, browser, siteOrigin: "http://nas:3000" });
  assert.deepEqual(sent, [42]);
});
