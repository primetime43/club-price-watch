import assert from "node:assert/strict";
import test from "node:test";
import { database } from "./database.ts";
import { addItem } from "./fixtures.ts";
import { mergeItems } from "../db/merge.ts";
import { trackedItems, priceChecks, itemAliases } from "../db/schema.ts";
import { exportBackup, restoreBackup } from "../db/backup.ts";
import { savePurchase } from "../db/purchase.ts";
import { saveItemPrice } from "../db/save-price.ts";
import { PRODUCT_URL } from "./fixtures.ts";
import { eq, sql } from "drizzle-orm";
const other = PRODUCT_URL.replace("6351759", "6351760");

test("unknown-location links remain conservative after the kept item gets its first located price", async () => {
  const a = database(); const b = database();
  try {
    const unknown = { clubId: null, clubName: null };
    const keep = (await addItem(a.db, { name: "Keep", url: PRODUCT_URL }, unknown)).item;
    const source = (await addItem(a.db, { name: "Source", url: other }, unknown)).item;
    await mergeItems(a.db, source.id, keep.id);
    assert.equal(await saveItemPrice(a.db, keep.id, 499), "missing-club");
    await a.db.update(trackedItems).set({ clubId: "111", clubName: "Example" }).where(eq(trackedItems.id, keep.id));
    assert.equal(await saveItemPrice(a.db, keep.id, 499), "saved");
    const backup = await exportBackup(a.db);
    assert.equal(backup.items[0].aliases?.[0].clubId, null);
    await restoreBackup(b.db, backup, "replace");
    assert.equal((await addItem(b.db, { name: "Again", url: other }, { clubId: "111", clubName: "Example" })).existing, true);
  } finally { a.close(); b.close(); }
});

test("merge combines full histories, preserves kept details, carries shopping membership and remembers old links", async () => {
  const a = database(); const b = database();
  try {
    const keep = (await addItem(a.db, { name: "Keep", url: PRODUCT_URL, currentPrice: 4.99, targetPrice: 4 })).item;
    const source = (await addItem(a.db, { name: "Source", url: other, currentPrice: 4.89 })).item;
    await a.db.update(trackedItems).set({ onShoppingList: true }).where(eq(trackedItems.id, source.id));
    for (const id of [source.id, keep.id]) await savePurchase(a.db, id, { price: 4.79, date: "2026-01-01" });
    await mergeItems(a.db, source.id, keep.id);
    const [remaining] = await a.db.select().from(trackedItems);
    assert.equal(remaining.id, keep.id); assert.equal(remaining.name, "Keep");
    assert.equal(remaining.currentPriceCents, 499); assert.equal(remaining.targetPriceCents, 400);
    assert.equal(remaining.onShoppingList, true);
    const checks = await a.db.select().from(priceChecks);
    assert.equal(checks.length, 3); assert.ok(checks.every(row => row.itemId === keep.id));
    const duplicate = await addItem(a.db, { name: "Ignore", url: other, currentPrice: 999 });
    assert.equal(duplicate.existing, true); assert.equal(duplicate.item.id, keep.id);
    const backup = await exportBackup(a.db); assert.equal(backup.version, 4);
    assert.equal(backup.items[0].aliases?.[0].url, other);
    await restoreBackup(b.db, backup, "replace");
    assert.deepEqual((await exportBackup(b.db)).items, backup.items);
    const restoredDuplicate = await addItem(b.db, { name: "Old link", url: other });
    assert.equal(restoredDuplicate.existing, true);
    assert.equal((await b.db.select().from(trackedItems)).length, 1);
  } finally { a.close(); b.close(); }
});

test("failed final deletion rolls back moved history, aliases and shopping changes", async () => {
  const a = database();
  try {
    const keep = (await addItem(a.db, { name: "Keep", url: PRODUCT_URL, currentPrice: 4.99 })).item;
    const source = (await addItem(a.db, { name: "Source", url: other, currentPrice: 4.89 })).item;
    await a.db.run(sql`CREATE TRIGGER test_merge_failure BEFORE DELETE ON tracked_items BEGIN SELECT RAISE(ABORT, 'test rollback'); END`);
    const before = await exportBackup(a.db);
    await assert.rejects(mergeItems(a.db, source.id, keep.id));
    assert.deepEqual((await exportBackup(a.db)).items, before.items);
    assert.equal((await a.db.select().from(itemAliases)).length, 0);
  } finally { a.close(); }
});

test("merges include all history, chain old links, and allow only one winner for the same source", async () => {
  const a = database();
  try {
    const keep = (await addItem(a.db, { name: "Keep", url: PRODUCT_URL })).item;
    const source = (await addItem(a.db, { name: "Source", url: other })).item;
    const thirdUrl = PRODUCT_URL.replace("6351759", "6351761");
    const third = (await addItem(a.db, { name: "Third", url: thirdUrl })).item;
    for (let i = 0; i < 65; i++) await a.db.insert(priceChecks).values({ itemId: source.id, priceCents: 400 + i, checkedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() });
    const results = await Promise.allSettled([mergeItems(a.db, source.id, keep.id), mergeItems(a.db, source.id, third.id)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const winner = results[0].status === "fulfilled" ? keep : third;
    const loser = winner.id === keep.id ? third : keep;
    await mergeItems(a.db, winner.id, loser.id);
    assert.equal((await a.db.select().from(priceChecks)).length, 65);
    for (const url of [PRODUCT_URL, other, thirdUrl]) assert.equal((await addItem(a.db, { name: "Again", url })).item.id, loser.id);
    await a.db.delete(trackedItems).where(eq(trackedItems.id, loser.id));
    assert.equal((await a.db.select().from(itemAliases)).length, 0);
  } finally { a.close(); }
});

test("merge rejects mixed clubs, same/missing items and rolls back on alias failures", async () => {
  const a = database();
  try {
    const keep = (await addItem(a.db, { name: "Keep", url: PRODUCT_URL, currentPrice: 4.99 })).item;
    const source = (await addItem(a.db, { name: "Source", url: other, currentPrice: 4.89 })).item;
    const before = await exportBackup(a.db);
    await assert.rejects(mergeItems(a.db, keep.id, keep.id), /different/);
    await assert.rejects(mergeItems(a.db, "missing", keep.id), /no longer/);
    a.failNextInsert(); await assert.rejects(mergeItems(a.db, source.id, keep.id));
    assert.deepEqual((await exportBackup(a.db)).items, before.items);
    assert.equal((await a.db.select().from(itemAliases)).length, 0);
    const different = (await addItem(a.db, { name: "Other club", url: other }, { clubId: "111", clubName: "Example" })).item;
    await assert.rejects(mergeItems(a.db, different.id, keep.id), /club numbers/);
  } finally { a.close(); }
});
