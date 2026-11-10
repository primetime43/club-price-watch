import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { database } from "./database.ts";
import { addItem, isDuplicateProductError } from "../db/add-item.ts";
import { trackedItems, priceChecks } from "../db/schema.ts";
import { restoreBackup, exportBackup } from "../db/backup.ts";
import { PRODUCT_URL } from "./fixtures.ts";
import { quickAdd } from "../extension/src/quick-add.ts";
import { createItemsClient } from "../core/api.ts";
import { item } from "./fixtures.ts";

test("API add reuses the product ID across slugs, hostnames, query strings and trailing slashes", async () => {
  const a = database();
  try {
    const first = await addItem(a.db, { name: "Original", url: PRODUCT_URL, currentPrice: 9.99, targetPrice: 8.99 });
    for (const url of [PRODUCT_URL + "?ref=shop#section", PRODUCT_URL + "/", PRODUCT_URL.replace("test-product", "new-slug").replace("www.bjs.com", "bjs.com")]) {
      const duplicate = await addItem(a.db, { name: "Overwrite attempt", url, currentPrice: 1, targetPrice: 2 });
      assert.equal(duplicate.existing, true); assert.equal(duplicate.item.id, first.item.id);
      assert.equal(duplicate.item.name, "Original"); assert.equal(duplicate.item.currentPriceCents, 999); assert.equal(duplicate.item.targetPriceCents, 899);
      assert.equal(duplicate.item.history.length, 1);
    }
    assert.equal((await a.db.select().from(trackedItems)).length, 1);
    assert.equal((await a.db.select().from(priceChecks)).length, 1);
  } finally { a.close(); }
});

test("competing API adds create one item and one initial history point", async () => {
  const a = database();
  try {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => addItem(a.db, { name: `Tab ${i}`, url: PRODUCT_URL + `?tab=${i}`, currentPrice: 9.99 })));
    assert.equal(results.filter(result => !result.existing).length, 1);
    assert.equal(new Set(results.map(result => result.item.id)).size, 1);
    assert.equal((await a.db.select().from(trackedItems)).length, 1);
    assert.equal((await a.db.select().from(priceChecks)).length, 1);
  } finally { a.close(); }
});

test("database insert and identity-update guards preserve known club distinctions and unknown provenance", async () => {
  const a = database();
  try {
    const one = await addItem(a.db, { name: "One", url: PRODUCT_URL }, { clubId: "111", clubName: "Test club one" });
    const two = await addItem(a.db, { name: "Two", url: PRODUCT_URL }, { clubId: "222", clubName: "Test club two" });
    assert.equal(one.existing, false); assert.equal(two.existing, false);
    await assert.rejects(a.db.insert(trackedItems).values({ id: "bypass", name: "Bypass", url: PRODUCT_URL + "?other=yes", clubId: "111" }), isDuplicateProductError);
    await assert.rejects(a.db.insert(trackedItems).values({ id: "unknown", name: "Unknown", url: PRODUCT_URL, clubId: null }), isDuplicateProductError);
    await assert.rejects(a.db.update(trackedItems).set({ clubId: "111" }).where(eq(trackedItems.id, two.item.id)), isDuplicateProductError);
    const old = await addItem(a.db, { name: "Legacy", url: PRODUCT_URL.replace("6351759", "6351760") }, { clubId: null, clubName: null });
    const again = await addItem(a.db, { name: "Duplicate", url: old.item.url }, { clubId: "111", clubName: "Test club one" });
    assert.equal(again.existing, true); assert.equal(again.item.clubId, null);
  } finally { a.close(); }
});

test("failed initial history rolls back the new item and duplicate backup imports leave current data intact", async () => {
  const a = database();
  try {
    a.failAfterInsert(1);
    await assert.rejects(addItem(a.db, { name: "Failed", url: PRODUCT_URL, currentPrice: 9.99 }), /Injected insert failure/);
    assert.equal((await a.db.select().from(trackedItems)).length, 0);
    await addItem(a.db, { name: "Kept", url: PRODUCT_URL, currentPrice: 9.99 });
    const snapshot = await exportBackup(a.db);
    await assert.rejects(restoreBackup(a.db, { ...snapshot, items: [...snapshot.items, ...snapshot.items] }, "replace"), /duplicate products/);
    assert.deepEqual((await exportBackup(a.db)).items, snapshot.items);
  } finally { a.close(); }
});

test("quick-add respects an API duplicate discovered after its advisory list read", async () => {
  const saved = item();
  const api = createItemsClient("", async (_url, init) => Response.json(init?.method === "POST" ? { item: saved, existing: true } : { items: [] }));
  const result = await quickAdd(saved.url, "A competing tab already added this", api);
  assert.equal(result.existing, true); assert.equal(result.item.id, saved.id);
});

test("migration leaves existing duplicate records and their histories untouched", async () => {
  const a = database(sqlite => {
    for (const id of ["legacy-one", "legacy-two"]) {
      sqlite.prepare("INSERT INTO tracked_items (id, name, url, current_price_cents) VALUES (?, ?, ?, ?)").run(id, id, PRODUCT_URL, 999);
      sqlite.prepare("INSERT INTO price_checks (item_id, price_cents) VALUES (?, ?)").run(id, 999);
    }
  });
  try {
    assert.equal((await a.db.select().from(trackedItems)).length, 2);
    assert.equal((await a.db.select().from(priceChecks)).length, 2);
    const result = await addItem(a.db, { name: "No third copy", url: PRODUCT_URL });
    assert.equal(result.existing, true);
    assert.equal((await a.db.select().from(trackedItems)).length, 2);
    assert.equal((await a.db.select().from(priceChecks)).length, 2);
  } finally { a.close(); }
});
