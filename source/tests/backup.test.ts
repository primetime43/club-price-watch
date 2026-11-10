import { TEST_CLUB } from "./fixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { database } from "./database.ts";
import { exportBackup, restoreBackup } from "../db/backup.ts";
import { parseBackup, parseBackupFile } from "../core/backup.ts";
import type { WatchlistBackup } from "../core/backup.ts";
import { APP } from "../core/config.ts";
import { PRODUCT_URL } from "./fixtures.ts";

function backup(): WatchlistBackup {
  return { format: "club-price-watch", version: 3, clubId: TEST_CLUB.clubId, exportedAt: "2026-11-08T09:00:00.000Z", items: [{
    clubId: TEST_CLUB.clubId, clubName: "Test club", name: "Test item", url: PRODUCT_URL, itemNumber: "123", imageUrl: null,
    currentPriceCents: 999, previousPriceCents: 1099, targetPriceCents: 899,
    lastCheckedAt: "2026-11-08T08:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", archivedAt: null, onShoppingList: false,
    history: Array.from({ length: 75 }, (_, i) => ({ clubId: TEST_CLUB.clubId, clubName: "Test club", priceCents: 999 + i, checkedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() })),
  }] };
}


test("backup round trip preserves all history beyond the dashboard limit and exact cents", async () => {
  const a = database(); const b = database();
  try {
    const input = backup();
    assert.deepEqual(await restoreBackup(a.db, input, "missing"), { imported: 1, skipped: 0, historyPoints: 75 });
    const exported = await exportBackup(a.db);
    assert.deepEqual(exported.items, input.items);
    assert.equal(exported.items[0].history.length, 75);
    await restoreBackup(b.db, parseBackupFile(JSON.stringify(exported)), "replace");
    assert.deepEqual((await exportBackup(b.db)).items, input.items);
    assert.ok(!JSON.stringify(exported).includes('"id"'));
  } finally { a.close(); b.close(); }
});

test("default restore identifies products by long ID and leaves existing data untouched", async () => {
  const a = database();
  try {
    await restoreBackup(a.db, backup(), "missing");
    const changed = backup(); changed.items[0].name = "Old name"; changed.items[0].currentPriceCents = 500;
    changed.items[0].url = PRODUCT_URL.replace("test-product", "different-slug");
    assert.deepEqual(await restoreBackup(a.db, changed, "missing"), { imported: 0, skipped: 1, historyPoints: 0 });
    assert.deepEqual((await exportBackup(a.db)).items, backup().items);
  } finally { a.close(); }
});

test("replacement restores the selected snapshot and rolls back deletes on insert failure", async () => {
  const a = database();
  try {
    await restoreBackup(a.db, backup(), "missing");
    const changed = backup(); changed.items[0].name = "Restored name"; changed.items[0].targetPriceCents = null;
    a.failNextInsert();
    await assert.rejects(restoreBackup(a.db, changed, "replace"), /Injected insert failure/);
    assert.deepEqual((await exportBackup(a.db)).items, backup().items);
    await restoreBackup(a.db, changed, "replace");
    assert.deepEqual((await exportBackup(a.db)).items, changed.items);
    assert.deepEqual(await restoreBackup(a.db, { ...changed, items: [] }, "replace"), { imported: 0, skipped: 0, historyPoints: 0 });
    assert.equal((await exportBackup(a.db)).items.length, 0);
  } finally { a.close(); }
});

test("malformed backups and unsafe fields are rejected before any restore writes", async () => {
  assert.throws(() => parseBackupFile("not json"), /not valid JSON/);
  for (const change of [{ version: 999 }, { clubId: "invalid" }, { exportedAt: "invalid" }]) assert.throws(() => parseBackup({ ...backup(), ...change }));
  for (const change of [{ url: "https://example.com/" }, { currentPriceCents: 0 }, { currentPriceCents: 1.5 }, { targetPriceCents: -1 }, { imageUrl: "javascript:alert(1)" }, { history: [{ priceCents: 999, checkedAt: "bad date" }] }]) {
    const input = backup(); Object.assign(input.items[0], change); assert.throws(() => parseBackup(input));
  }
  const safe = parseBackup({ ...backup(), accountToken: "discard", items: backup().items.map(item => ({ ...item, cookie: "discard" })) });
  assert.ok(!JSON.stringify(safe).includes("discard"));
  const a = database();
  try {
    await restoreBackup(a.db, backup(), "missing");
    await assert.rejects(restoreBackup(a.db, { ...backup(), version: 999 } as unknown as WatchlistBackup, "replace"));
    assert.deepEqual((await exportBackup(a.db)).items, backup().items);
  } finally { a.close(); }
});

test("location migration uses no identifying defaults and preserves old prices as unknown location", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync(new URL("../drizzle/0000_initial_price_tracker.sql", import.meta.url), "utf8"));
    sqlite.exec("INSERT INTO tracked_items (id, name, url, current_price_cents) VALUES ('old', 'Old item', 'https://www.bjs.com/product/test/9999999999999', 1234)");
    sqlite.exec("INSERT INTO price_checks (item_id, price_cents) VALUES ('old', 1234)");
    const migration = readFileSync(new URL("../drizzle/0001_price_locations.sql", import.meta.url), "utf8");
    assert.doesNotMatch(migration, /DEFAULT\s+['"]/i);
    sqlite.exec(migration);
    const row = sqlite.prepare("SELECT current_price_cents, club_id, club_name FROM tracked_items").get();
    assert.equal(row?.current_price_cents, 1234); assert.equal(row?.club_id, null); assert.equal(row?.club_name, null);
    const history = sqlite.prepare("SELECT price_cents, club_id, club_name FROM price_checks").get();
    assert.equal(history?.price_cents, 1234); assert.equal(history?.club_id, null); assert.equal(history?.club_name, null);
  } finally { sqlite.close(); }
});

test("older backups restore without guessing a per-item or historical location", async () => {
  const old = { ...backup(), version: 1, items: backup().items.map(({ clubId, clubName, ...item }) => ({ ...item, history: item.history.map(({ clubId, clubName, ...point }) => point) })) };
  const upgraded = parseBackupFile(JSON.stringify(old));
  assert.equal(upgraded.version, 4);
  assert.equal(upgraded.items[0].clubId, null); assert.equal(upgraded.items[0].clubName, null);
  assert.ok(upgraded.items[0].history.every(point => point.clubId === null && point.clubName === null));
  const a = database();
  try {
    await restoreBackup(a.db, upgraded, "missing");
    assert.deepEqual((await exportBackup(a.db)).items, upgraded.items);
  } finally { a.close(); }
});

test("new backups retain individual item and history locations", async () => {
  const input = backup();
  input.items[0].history[0].clubId = "999";
  input.items[0].history[0].clubName = "Another test club";
  const a = database();
  try {
    await restoreBackup(a.db, input, "replace");
    assert.deepEqual((await exportBackup(a.db)).items, input.items);
    const malformed = backup(); malformed.items[0].clubId = "not-a-club";
    assert.throws(() => parseBackup(malformed), /invalid saved location/);
  } finally { a.close(); }
});

test("restore distinguishes explicit club locations but skips existing unknown-location products", async () => {
  const a = database();
  try {
    await restoreBackup(a.db, backup(), "missing");
    const other = backup(); other.items[0].clubId = "999"; other.items[0].clubName = "Another test club";
    assert.equal((await restoreBackup(a.db, other, "missing")).imported, 1);
    const unknown = backup(); unknown.items[0].clubId = null; unknown.items[0].clubName = null;
    assert.equal((await restoreBackup(a.db, unknown, "missing")).skipped, 1);
  } finally { a.close(); }
});
