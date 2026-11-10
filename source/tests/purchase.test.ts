import assert from "node:assert/strict";
import test from "node:test";
import { database } from "./database.ts";
import { trackedItems, priceChecks } from "../db/schema.ts";
import { savePurchase } from "../db/purchase.ts";
import { readItemHistory } from "../db/history.ts";
import { saveItemPrice } from "../db/save-price.ts";
import { exportBackup, restoreBackup } from "../db/backup.ts";
import { parsePurchase, purchasePrice, orderDate } from "../core/purchase.ts";
import { orderAddProduct } from "../extension/src/background.ts";
import { readOrderPrice } from "../extension/src/order-products.ts";
import { APP } from "../core/config.ts";
import { clubFromPickup, clubNumber } from "../core/clubs.ts";
import { PRODUCT_URL } from "./fixtures.ts";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.ts";
import { sqliteBinding } from "../server/sqlite.ts";

test("purchase validation rejects missing, future/impossible dates and ambiguous or nonpositive prices", () => {
  assert.deepEqual(parsePurchase({ price: 1.49, date: "2026-01-01", orderNumber: "discard" }), { price: 1.49, date: "2026-01-01" });
  for (const purchase of [{ price: 0, date: "2026-01-01" }, { price: 1.234, date: "2026-01-01" }, { price: 1, date: "2026-02-30" }, { price: 1, date: "9999-01-01" }, { price: 1 }, { price: "1.49", date: "2026-01-01" }]) assert.throws(() => parsePurchase(purchase));
  assert.equal(purchasePrice(" $1,234.56 "), 1234.56);
  for (const value of ["$0.00", "$-1.49", "2 for $3.00", "$3.00 $4.00", "3.00", "$1,23.00"]) assert.equal(purchasePrice(value), null);
});

test("order dates and pickup-club fields are validated without inferring a club ID", () => {
  assert.equal(orderDate("1/5/2026"), "2026-01-05");
  for (const value of ["02/30/2026", "13/01/2026", "01/01/9999", "01/05/2026 6:00 PM", "not a date"]) assert.equal(orderDate(value), null);
  assert.deepEqual(parsePurchase({ price: 1.49, date: "2026-01-05", clubId: "000111", clubName: " Example Club " }), { price: 1.49, date: "2026-01-05", clubId: "111", clubName: "Example Club" });
  for (const location of [{ clubId: "0", clubName: "Test" }, { clubId: "111" }, { clubName: "Test" }, { clubId: 111, clubName: "Test" }, { location: "Legacy address" }, { clubId: "111", clubName: "x".repeat(101) }])
    assert.throws(() => parsePurchase({ price: 1.49, date: "2026-01-05", ...location }));
});

test("pickup address resolution requires an exact verified address or public club identity", () => {
  assert.equal(clubFromPickup("100 Example Road Example City PA 15000"), null);
  assert.equal(clubFromPickup("100 Unverified Road Example City PA 15000"), null);
  assert.equal(clubFromPickup("100 Unverified Road", "https://maps.example.com/?clubId=111"), null);
  assert.deepEqual(clubFromPickup("Club #0111"), { clubId: "111", clubName: "Club 111" });
  assert.deepEqual(clubFromPickup("100 Example Road", "/cl/example-club/0111/"), { clubId: "111", clubName: "Example Club" });
  for (const href of ["https://example.com/cl/example/0111", "http://www.bjs.com/cl/example/0111", "https://user@www.bjs.com/cl/example/0111", "https://www.bjs.com:123/cl/example/0111"])
    assert.equal(clubFromPickup("Unverified address", href), null);
  assert.equal(clubFromPickup("Club #222", "/cl/example-club/0111"), null);
  assert.equal(clubNumber("0555"), "555");
});

test("purchase messages allow only validated purchase fields from the order-page top frame", () => {
  const sender = { id: APP.extensionId, frameId: 0, url: "https://www.bjs.com/account/manageOrders/example-order" };
  const message = { type: "CPW_ORDER_QUICK_ADD", product: { url: PRODUCT_URL, name: "Test", purchase: { price: 1.49, date: "2026-01-01", orderNumber: "discard" } } };
  assert.deepEqual(orderAddProduct(message, sender, APP.extensionId)?.purchase, { price: 1.49, date: "2026-01-01" });
  const located = { ...message, product: { ...message.product, purchase: { ...message.product.purchase, clubId: "0111", clubName: "Example Club" } } };
  assert.deepEqual(orderAddProduct(located, sender, APP.extensionId)?.purchase, { price: 1.49, date: "2026-01-01", clubId: "111", clubName: "Example Club" });
  assert.equal(orderAddProduct(message, { ...sender, frameId: 1 }, APP.extensionId), null);
  assert.equal(orderAddProduct({ ...message, product: { ...message.product, purchase: { price: 0 } } }, sender, APP.extensionId), null);
});

test("club-number migration and backup retain distinct legacy purchase records without assuming club identity", async () => {
  const sqlite = new DatabaseSync(":memory:"); const restored = database();
  try {
    for (const name of ["0000_initial_price_tracker", "0001_price_locations", "0002_duplicate_products", "0003_archive_items", "0004_shopping_list", "0005_purchase_history", "0006_purchase_location"])
      sqlite.exec(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
    sqlite.prepare("INSERT INTO tracked_items(id,name,url) VALUES (?,?,?)").run("one", "Test", PRODUCT_URL);
    for (const location of ["Legacy example club one", "Legacy example club two"])
      sqlite.prepare("INSERT INTO price_checks(item_id,price_cents,checked_at,source,purchase_location) VALUES (?,?,?,?,?)").run("one", 149, "2026-01-05T00:00:00.000Z", "purchase", location);
    const before = sqlite.prepare("SELECT * FROM price_checks ORDER BY id").all();
    sqlite.exec(readFileSync(new URL("../drizzle/0007_purchase_club_identity.sql", import.meta.url), "utf8"));
    assert.deepEqual(sqlite.prepare("SELECT * FROM price_checks ORDER BY id").all(), before);
    sqlite.exec(readFileSync(new URL("../drizzle/0008_item_merges.sql", import.meta.url), "utf8"));
    const backup = await exportBackup(drizzle(sqliteBinding(sqlite), { schema }));
    await restoreBackup(restored.db, backup, "replace");
    assert.deepEqual((await exportBackup(restored.db)).items, backup.items);
    assert.ok(backup.items[0].history.every(point => point.clubId === null));
  } finally { sqlite.close(); restored.close(); }
});

test("order price adapter uses Item Price, never total, quantity, SKU or whole row text", () => {
  const table = { querySelectorAll: () => ["Item Description", "Item", "Item Price", "Qty (Weight)", "Total Price"].map(textContent => ({ textContent })) };
  const row = {
    get textContent(): string { throw Error("Never read order-row text"); },
    closest: () => table,
    querySelectorAll: () => ["Test", "12345", "$1.49", "3", "$4.47"].map(textContent => ({ textContent })),
  };
  assert.equal(readOrderPrice({ closest: () => row } as unknown as HTMLAnchorElement), 1.49);
  assert.equal(readOrderPrice({ closest: () => null } as unknown as HTMLAnchorElement), null);
});

test("historical purchases preserve current state, serialize repeat imports, retain unknown locations and survive backup", async () => {
  const a = database(); const b = database();
  try {
    await a.db.insert(trackedItems).values({ id: "one", name: "Test", url: PRODUCT_URL, clubId: "555", clubName: "Test club", onShoppingList: true });
    await saveItemPrice(a.db, "one", 299);
    const before = await a.db.select().from(trackedItems);
    const purchase = { price: 1.49, date: "2026-01-01" };
    await Promise.all(Array.from({ length: 12 }, () => savePurchase(a.db, "one", purchase)));
    assert.deepEqual(await a.db.select().from(trackedItems), before);
    let history = await readItemHistory(a.db, "one");
    assert.equal(history?.length, 2);
    assert.deepEqual(history?.[0], { id: history?.[0].id, priceCents: 149, checkedAt: "2026-01-01T00:00:00.000Z", source: "purchase", purchaseLocation: null, clubId: null, clubName: null });
    assert.equal(await savePurchase(a.db, "missing", purchase), false);
    await assert.rejects(savePurchase(a.db, "one", { price: 0, date: purchase.date }));
    await restoreBackup(b.db, await exportBackup(a.db), "replace");
    const restored = await b.db.select().from(trackedItems);
    history = await readItemHistory(b.db, restored[0].id);
    assert.equal(history?.[0].source, "purchase");
    assert.equal(history?.[0].clubId, null);
    assert.equal(history?.[0].priceCents, 149);
    a.failNextInsert();
    await assert.rejects(savePurchase(a.db, "one", { price: 1.79, date: "2026-01-02" }));
    assert.equal((await a.db.select().from(priceChecks)).length, 2);
    assert.deepEqual(await a.db.select().from(trackedItems), before);
  } finally { a.close(); b.close(); }
});

test("purchase location persists through history/backup and distinguishes repeat imports at different clubs", async () => {
  const a = database(); const b = database();
  try {
    await a.db.insert(trackedItems).values({ id: "one", name: "Test", url: PRODUCT_URL, clubId: "555", clubName: "Test club" });
    await saveItemPrice(a.db, "one", 299);
    const before = await a.db.select().from(trackedItems);
    const purchase = { price: 1.49, date: "2026-01-05", clubId: "111", clubName: "Example Club" };
    await Promise.all(Array.from({ length: 12 }, () => savePurchase(a.db, "one", purchase)));
    await savePurchase(a.db, "one", { ...purchase, clubId: "0111" });
    let history = await readItemHistory(a.db, "one");
    assert.equal(history?.length, 2);
    assert.equal(history?.[0].purchaseLocation, null);
    assert.equal(history?.[0].clubId, "111");
    assert.equal(history?.[0].clubName, "Example Club");
    await savePurchase(a.db, "one", { ...purchase, clubId: "222", clubName: "Different Club" });
    assert.equal((await readItemHistory(a.db, "one"))?.length, 3);
    assert.deepEqual(await a.db.select().from(trackedItems), before);
    const backup = await exportBackup(a.db);
    assert.equal(backup.items[0].history[0].clubId, "111");
    assert.equal(backup.items[0].history[0].purchaseLocation, undefined);
    await restoreBackup(b.db, backup, "replace");
    const [restored] = await b.db.select().from(trackedItems);
    history = await readItemHistory(b.db, restored.id);
    assert.equal(history?.[0].clubId, "111");
    assert.equal(history?.[1].clubId, "222");
    assert.equal(history?.[2].purchaseLocation, null);
  } finally { a.close(); b.close(); }
});
