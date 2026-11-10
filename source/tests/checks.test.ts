import assert from "node:assert/strict";
import test from "node:test";
import { createItemsClient } from "../core/api.ts";
import { CheckError, checkItems, selectCheckItems } from "../core/checks.ts";
import { item } from "./fixtures.ts";

test("dry runs cannot write website prices", async () => {
  const results = await checkItems({ items: [item()], dryRun: true, readPrice: async () => 367.99, savePrice: async () => assert.fail("A dry run saved a price") });
  assert.equal(results[0].status, "tested");
});
test("only valid successful observations are uploaded", async () => {
  const saved: { id: string; price: number }[] = [];
  const results = await checkItems({ items: [item(), item({ id: "bad-price" }), item({ id: "blocked" }), item({ id: "wrong-host", url: "https://example.com/" })], dryRun: false,
    readPrice: async current => { if (current.id === "blocked") throw new Error("private network detail"); return current.id === "bad-price" ? 0 : 367.99; },
    savePrice: async (id, price) => { saved.push({ id, price }); } });
  assert.deepEqual(saved, [{ id: item().id, price: 367.99 }]);
  assert.deepEqual(results.map(result => result.status), ["recorded", "failed", "failed"]);
  assert.doesNotMatch(JSON.stringify(results), /private network detail/);
});
test("a single-item request never falls back to the entire watchlist", () => {
  const items = [item(), item({ id: "other" })];
  assert.deepEqual(selectCheckItems(items, item().id), [items[0]]);
  assert.equal(selectCheckItems(items, null), items);
  assert.throws(() => selectCheckItems(items, "missing"), CheckError);
  assert.throws(() => selectCheckItems(items, "https://example.com/"), CheckError);
});
test("one typed client validates and writes the public API contract", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const api = createItemsClient("https://example.com", async (input, init) => {
    requests.push({ url: String(input), init });
    return Response.json(init?.method === "PATCH" ? { ok: true } : { items: [item()] });
  });
  assert.equal((await api.list())[0].id, item().id);
  await api.savePrice(item().id, 1999.99, "555");
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { id: item().id, price: 1999.99, clubId: "555" });
  assert.equal(requests[1].url, "https://example.com/api/items");
  await assert.rejects(api.savePrice(item().id, 0, "555"), CheckError);
  assert.equal(requests.length, 2);
});
test("malformed API data and failed writes are reported, not guessed", async () => {
  const malformed = createItemsClient("", async () => Response.json({ items: [{ id: "broken" }] }));
  await assert.rejects(malformed.list(), /invalid watchlist/);
  const unavailable = createItemsClient("", async () => Response.json({ error: "Unavailable" }, { status: 503 }));
  await assert.rejects(unavailable.savePrice(item().id, 367.99, "555"), /Unavailable/);
  const invalidPreview = createItemsClient("", async () => Response.json({ preview: { name: "Product", price: "1999.99" } }));
  await assert.rejects(invalidPreview.preview(item().url), /invalid product details/);
  const validPreview = { name: "Product", imageUrl: null, itemNumber: null, price: 1999.99 };
  const preview = createItemsClient("", async () => Response.json({ preview: validPreview }));
  assert.deepEqual(await preview.preview(item().url), validPreview);
});
