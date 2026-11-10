import assert from "node:assert/strict";
import test from "node:test";
import { quickAdd } from "../extension/src/quick-add.ts";
import { createItemsClient } from "../core/api.ts";
import { item } from "./fixtures.ts";

test("quick add reuses a tracked product even when its URL slug changes", async () => {
  const saved = item();
  const api = createItemsClient("", async (_url, init) => {
    assert.notEqual(init?.method, "POST");
    return Response.json({ items: [saved] });
  });
  assert.equal((await quickAdd(saved.url + "?ref=shop", "Product", api)).existing, true);
});
test("quick add strips tracking fragments and never invents a price", async () => {
  const saved = item();
  let body: Record<string, unknown> = {};
  const api = createItemsClient("", async (_url, init) => {
    if (init?.method === "POST") { body = JSON.parse(String(init.body)); return Response.json({ item: saved }); }
    return Response.json({ items: [] });
  });
  await quickAdd(saved.url + "?ref=shop#section", "Product | BJ’s Wholesale", api);
  assert.equal(body.name, "Product");
  assert.equal(body.currentPrice, undefined);
  assert.equal(new URL(String(body.url)).search, "");
  assert.equal(new URL(String(body.url)).hash, "");
  await assert.rejects(quickAdd("https://example.com/", "Wrong page", api), /product page/);
});
test("removal sends DELETE only for a valid tracked item id", async () => {
  const calls: string[] = [];
  const api = createItemsClient("", async (url, init) => { calls.push(`${init?.method} ${url}`); return Response.json({ ok: true }); });
  await api.remove("tracked-item");
  await assert.rejects(api.remove("../invalid"));
  assert.deepEqual(calls, ["DELETE /api/items?id=tracked-item"]);
});
