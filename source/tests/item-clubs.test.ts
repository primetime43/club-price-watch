import assert from "node:assert/strict";
import test from "node:test";
import { checkItems } from "../core/checks.ts";
import { resultPrice, readPriceInTab } from "../extension/src/browser-reader.ts";
import { installPageReader } from "../extension/src/page-reader.ts";
import { addItem } from "../db/add-item.ts";
import { saveItemPrice } from "../db/save-price.ts";
import { database } from "./database.ts";
import { priceChecks } from "../db/schema.ts";
import { item, PRODUCT_URL, PRODUCT_ID, NONCE, saleProduct, priceMessage } from "./fixtures.ts";
import { APP } from "../core/config.ts";
import { exportBackup } from "../db/backup.ts";
import { parseBackup } from "../core/backup.ts";
import { pickupLocatorUrl } from "../core/public-clubs.ts";

test("a mixed-club run passes each item's own club to the save and skips unknown locations", async () => {
  const writes: unknown[] = [], reads: string[] = [];
  const results = await checkItems({ items: [item({ id: "one", clubId: "111" }), item({ id: "two", clubId: "222" }), item({ id: "unknown", clubId: null, clubName: null })], dryRun: false,
    readPrice: async item => { reads.push(item.clubId!); return 3.99; }, savePrice: async (id, price, club) => { writes.push({ id, price, club }); } });
  assert.deepEqual(reads, ["111", "222"]); assert.deepEqual(writes, [{ id: "one", price: 3.99, club: "111" }, { id: "two", price: 3.99, club: "222" }]);
  assert.equal(results[2].status, "failed");
  assert.equal(resultPrice({ ...priceMessage, clubId: "111" }, PRODUCT_ID, NONCE, "222"), null);
  assert.equal(resultPrice({ ...priceMessage, clubId: "0222" }, PRODUCT_ID, NONCE, "222"), 367.99);
  await assert.rejects(readPriceInTab(item({ clubId: null, clubName: null }), { browser: {} as never }), /recorded club/);
});

test("page fallback requests and parses the item's requested club rather than another returned club", async () => {
  let fallback: (() => void) | undefined; let result: { clubId: string; price: number | null } | undefined;
  const calls: string[] = [];
  installPageReader({ href: PRODUCT_URL, hash: `#cpw-check=${NONCE}&cpw-club=222`,
    xhrPrototype: { open() {}, send() {} } as unknown as Pick<XMLHttpRequest, "open" | "send">,
    fetch: async input => { calls.push(String(input)); return Response.json({ bjsClubProduct: [{ ...saleProduct, clubId: "111" }, { ...saleProduct, clubId: "0222", inClubOfferPrice: { amount: 12.34 } }] }); },
    replaceFetch() {}, delay: fn => { fallback = fn; }, publish: value => { result = value; } });
  fallback!(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(new URL(calls[0]).searchParams.get("clubId"), "222"); assert.equal(result?.clubId, "222"); assert.equal(result?.price, 12.34);
  assert.equal(new URL(calls[0]).searchParams.get("productId"), PRODUCT_ID);
});

test("imported club becomes the item's tracking location, saves retain it, mismatched/unknown club saves never write", async () => {
  const a = database();
  try {
    const first = await addItem(a.db, { name: "One", url: PRODUCT_URL, clubId: "111", clubName: "Example One" });
    const second = await addItem(a.db, { name: "Two", url: PRODUCT_URL, clubId: "222", clubName: "Example Two" });
    const unknown = await addItem(a.db, { name: "Unknown", url: PRODUCT_URL.replace("6351759", "6351761") });
    assert.equal(unknown.item.clubId, null);
    assert.equal(await saveItemPrice(a.db, unknown.item.id, 500), "missing-club");
    assert.equal(await saveItemPrice(a.db, first.item.id, 500, "222"), "other-club");
    assert.equal((await a.db.select().from(priceChecks)).length, 0);
    assert.equal(await saveItemPrice(a.db, first.item.id, 500, "111"), "saved");
    assert.equal(await saveItemPrice(a.db, second.item.id, 600, "222"), "saved");
    assert.deepEqual((await a.db.select().from(priceChecks)).map(p => p.clubId), ["111", "222"]);
    await assert.rejects(addItem(a.db, { name: "Ambiguous", url: PRODUCT_URL }), /multiple clubs/);
    const backup = await exportBackup(a.db); assert.equal(backup.clubId, null); assert.equal(parseBackup(backup).items.length, 3);
    assert.ok(!("clubId" in APP)); assert.ok(!("clubName" in APP)); assert.ok(!("clubLocatorUrl" in APP));
  } finally { a.close(); }
});

test("locator area is taken from an observed public link without retaining tracking query or accepting other origins", () => {
  assert.equal(pickupLocatorUrl("https://www.bjs.com/clubLocatorDetail;radius=50;lat=42;lng=-72?tracking=discard"), "https://www.bjs.com/clubLocatorDetail;radius=25;lat=42;lng=-72");
  for (const url of ["https://example.com/clubLocatorDetail;lat=42;lng=-72", "https://www.bjs.com/clubLocatorDetail;lat=100;lng=-72", "https://user@www.bjs.com/clubLocatorDetail;lat=42;lng=-72", "https://www.bjs.com/account/manageOrders/test"])
    assert.equal(pickupLocatorUrl(url), null);
});
