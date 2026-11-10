import assert from "node:assert/strict";
import test from "node:test";
import { database } from "./database.ts";
import { PRODUCT_URL } from "./fixtures.ts";
import { addItem } from "../db/add-item.ts";
import { listItems, setArchived } from "../db/archive.ts";
import { setShoppingList } from "../db/shopping-list.ts";
import { exportBackup, restoreBackup } from "../db/backup.ts";
import { parseBackup } from "../core/backup.ts";
import { shoppingListValue } from "../core/items.ts";
import { createItemsClient } from "../core/api.ts";

test("shopping-list membership persists independently of prices, history and archive/restore", async () => {
  const a = database();
  try {
    const { item } = await addItem(a.db, { name: "Milk", url: PRODUCT_URL, currentPrice: 12.34, targetPrice: 10 });
    const before = await exportBackup(a.db);
    assert.equal((await listItems(a.db))[0].onShoppingList, false);
    assert.equal(await setShoppingList(a.db, item.id, true), true);
    const after = await exportBackup(a.db);
    assert.deepEqual(after.items, before.items.map(item => ({ ...item, onShoppingList: true })));
    await setArchived(a.db, item.id, true);
    await setArchived(a.db, item.id, false);
    assert.equal((await listItems(a.db))[0].onShoppingList, true);
    await addItem(a.db, { name: "Duplicate", url: PRODUCT_URL, currentPrice: 1 });
    assert.equal((await listItems(a.db))[0].onShoppingList, true);
    await setShoppingList(a.db, item.id, false);
    assert.deepEqual((await exportBackup(a.db)).items, before.items);
    assert.equal(await setShoppingList(a.db, "missing", true), false);
  } finally { a.close(); }
});

test("backups round-trip shopping selections, default older files to false, and preserve existing selections on missing-only import", async () => {
  const a = database(), b = database();
  try {
    const { item } = await addItem(a.db, { name: "Milk", url: PRODUCT_URL, currentPrice: 12.34 });
    await setShoppingList(a.db, item.id, true);
    const backup = await exportBackup(a.db);
    await restoreBackup(b.db, backup, "replace");
    assert.deepEqual((await exportBackup(b.db)).items, backup.items);
    const old = { ...backup, items: backup.items.map(({ onShoppingList, ...item }) => item) };
    assert.equal(parseBackup(old).items[0].onShoppingList, false);
    await restoreBackup(b.db, parseBackup(old), "missing");
    assert.equal((await listItems(b.db))[0].onShoppingList, true);
    assert.throws(() => parseBackup({ ...backup, items: backup.items.map(item => ({ ...item, onShoppingList: "yes" })) }), /invalid shopping-list/);
  } finally { a.close(); b.close(); }
});

test("shopping-list changes require isolated boolean writes and use the typed API without price writes", async () => {
  assert.equal(shoppingListValue({ id: "one", onShoppingList: true }), true);
  for (const onShoppingList of [1, "yes", null, undefined]) assert.throws(() => shoppingListValue({ id: "one", onShoppingList }));
  for (const field of ["price", "name", "targetPrice", "archived"]) assert.throws(() => shoppingListValue({ id: "one", onShoppingList: true, [field]: 1 }), /separately/);
  const bodies: unknown[] = [];
  const api = createItemsClient("", async (url, init) => {
    assert.equal(url, "/api/items"); assert.equal(init?.method, "PATCH");
    bodies.push(JSON.parse(String(init?.body))); return Response.json({ ok: true });
  });
  await api.shoppingList("one", true); await api.shoppingList("one", false);
  assert.deepEqual(bodies, [{ id: "one", onShoppingList: true }, { id: "one", onShoppingList: false }]);
  await assert.rejects(api.shoppingList("../bad", true));
  const missing = createItemsClient("", async () => Response.json({ error: "Item not found." }, { status: 404 }));
  await assert.rejects(missing.shoppingList("one", true), /not found/);
});
