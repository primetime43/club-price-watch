import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { database } from "./database.ts";
import { item, PRODUCT_URL } from "./fixtures.ts";
import { archiveValue } from "../core/items.ts";
import { createItemsClient } from "../core/api.ts";
import { addItem } from "../db/add-item.ts";
import { setArchived, listItems } from "../db/archive.ts";
import { readItemHistory } from "../db/history.ts";
import { saveItemPrice } from "../db/save-price.ts";
import { exportBackup, restoreBackup } from "../db/backup.ts";
import { parseBackup } from "../core/backup.ts";
import { trackedItems } from "../db/schema.ts";
import { quickAdd } from "../extension/src/quick-add.ts";

test("archive hides items from normal checks without changing any saved field/history; restore returns the same item", async () => {
  const a = database();
  try {
    const result = await addItem(a.db, { name: "Keep me", url: PRODUCT_URL, currentPrice: 12.34, targetPrice: 10 });
    await saveItemPrice(a.db, result.item.id, 1199);
    const before = (await listItems(a.db))[0];
    const history = await readItemHistory(a.db, before.id);
    assert.equal(await setArchived(a.db, before.id, true), true);
    assert.deepEqual(await listItems(a.db), []);
    const [archived] = await listItems(a.db, true);
    assert.ok(archived.archivedAt);
    assert.deepEqual({ ...archived, archivedAt: null }, before);
    assert.deepEqual(await readItemHistory(a.db, before.id), history);
    await setArchived(a.db, before.id, true);
    assert.equal((await listItems(a.db, true))[0].archivedAt, archived.archivedAt);
    assert.equal(await saveItemPrice(a.db, before.id, 1), "archived");
    assert.deepEqual(await readItemHistory(a.db, before.id), history);
    assert.equal((await listItems(a.db, true))[0].currentPriceCents, 1199);
    const duplicate = await addItem(a.db, { name: "Duplicate", url: PRODUCT_URL, currentPrice: 1 });
    assert.equal(duplicate.existing, true);
    assert.equal(duplicate.item.id, before.id);
    assert.equal(duplicate.item.archivedAt, archived.archivedAt);
    await setArchived(a.db, before.id, false);
    assert.deepEqual((await listItems(a.db))[0], before);
    assert.deepEqual(await readItemHistory(a.db, before.id), history);
    assert.equal(await saveItemPrice(a.db, before.id, 1099), "saved");
    assert.equal((await listItems(a.db))[0].previousPriceCents, 1199);
    assert.equal((await readItemHistory(a.db, before.id))?.length, history!.length + 1);
    assert.equal(await setArchived(a.db, "missing", true), false);
    assert.equal(await saveItemPrice(a.db, "missing", 1099), "missing");
  } finally { a.close(); }
});

test("queued price saves cannot append after archive and failed history inserts roll back price updates", async () => {
  const a = database();
  try {
    const { item: saved } = await addItem(a.db, { name: "Queue", url: PRODUCT_URL, currentPrice: 9.99 });
    // The price save yields during its read; archiving commits before its batch runs.
    const saving = saveItemPrice(a.db, saved.id, 899);
    await setArchived(a.db, saved.id, true);
    assert.equal(await saving, "archived");
    assert.equal((await readItemHistory(a.db, saved.id))?.length, 1);
    await setArchived(a.db, saved.id, false);
    const before = await listItems(a.db);
    a.failNextInsert();
    await assert.rejects(saveItemPrice(a.db, saved.id, 799), /Injected insert failure/);
    assert.deepEqual(await listItems(a.db), before);
    assert.equal((await readItemHistory(a.db, saved.id))?.length, 1);
  } finally { a.close(); }
});

test("v3 backups round-trip archived items and full history; old backups import as active", async () => {
  const a = database(), b = database();
  try {
    const { item: saved } = await addItem(a.db, { name: "Archived", url: PRODUCT_URL, currentPrice: 9.99 });
    await setArchived(a.db, saved.id, true);
    const backup = await exportBackup(a.db);
    assert.equal(backup.version, 4);
    assert.ok(backup.items[0].archivedAt);
    await restoreBackup(b.db, backup, "replace");
    assert.deepEqual((await exportBackup(b.db)).items, backup.items);
    assert.deepEqual(await listItems(b.db), []);
    await restoreBackup(b.db, { ...backup, items: backup.items.map(item => ({ ...item, archivedAt: null })) }, "missing");
    assert.ok((await listItems(b.db, true))[0].archivedAt);
    for (const version of [1, 2]) {
      const legacy = parseBackup({ ...backup, version, items: backup.items.map(({ archivedAt, ...item }) => item) });
      assert.equal(legacy.items[0].archivedAt, null);
    }
    assert.throws(() => parseBackup({ ...backup, items: backup.items.map(item => ({ ...item, archivedAt: false })) }), /invalid date/);
    assert.equal((await b.db.select().from(trackedItems).where(eq(trackedItems.archivedAt, backup.items[0].archivedAt!))).length, 1);
  } finally { a.close(); b.close(); }
});

test("archive API validates isolated writes, lists both views and reports errors without deleting", async () => {
  assert.equal(archiveValue({ id: "one", archived: true }), true);
  assert.equal(archiveValue({ id: "one", archived: false }), false);
  for (const archived of [null, "true", 1, undefined]) assert.throws(() => archiveValue({ id: "one", archived }));
  for (const field of ["price", "name", "targetPrice", "currentPriceCents"]) assert.throws(() => archiveValue({ id: "one", archived: true, [field]: 1 }), /separately/);
  const calls: unknown[] = [];
  const api = createItemsClient("", async (url, init) => {
    calls.push([url, init?.method ?? "GET", init?.body ? JSON.parse(String(init.body)) : null]);
    return Response.json(init?.method === "PATCH" ? { ok: true } : { items: [item()] });
  });
  await api.archive("one", true); await api.archive("one", false);
  await api.list(); await api.list(true);
  assert.deepEqual(calls, [["/api/items", "PATCH", { id: "one", archived: true }], ["/api/items", "PATCH", { id: "one", archived: false }], ["/api/items", "GET", null], ["/api/items?includeArchived=1", "GET", null]]);
  await assert.rejects(api.archive("../bad", true));
  const missing = createItemsClient("", async () => Response.json({ error: "Item not found." }, { status: 404 }));
  await assert.rejects(missing.archive("one", true), /not found/);
});

test("quick-add recognizes archived products without reactivating, overwriting or starting another add", async () => {
  const archived = item({ archivedAt: "2026-11-08T15:00:00.000Z", currentPriceCents: 1234 });
  const api = createItemsClient("", async (url, init) => {
    assert.equal(url, "/api/items?includeArchived=1");
    assert.notEqual(init?.method, "POST");
    return Response.json({ items: [archived] });
  });
  assert.deepEqual(await quickAdd(PRODUCT_URL, "Overwrite attempt", api), { item: archived, existing: true });
});
