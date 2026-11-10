import assert from "node:assert/strict";
import test from "node:test";
import { itemEditValues } from "../core/items.ts";
import { createItemsClient } from "../core/api.ts";

test("item edits trim names, convert targets once, and exclude observed price/history fields", () => {
  assert.deepEqual(itemEditValues({ name: "  Chips  ", targetPrice: 11.99, currentPriceCents: 0, history: [] }), { name: "Chips", targetPriceCents: 1199 });
  assert.deepEqual(itemEditValues({ name: "Chips", targetPrice: null }), { name: "Chips", targetPriceCents: null });
  for (const name of ["", "   ", 42, "x".repeat(301)]) assert.throws(() => itemEditValues({ name, targetPrice: null }), /item name/);
  for (const targetPrice of [0, -1, NaN, Infinity, "12", undefined, 0.001]) assert.throws(() => itemEditValues({ name: "Chips", targetPrice }), /positive target/);
});

test("editing uses metadata PATCH without a price write and clearing sends explicit null", async () => {
  const bodies: unknown[] = [];
  const api = createItemsClient("", async (url, init) => {
    assert.equal(url, "/api/items");
    assert.equal(init?.method, "PATCH");
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: true });
  });
  await api.edit("one", { name: " Renamed item ", targetPrice: 11.99 });
  await api.edit("one", { name: "Renamed item", targetPrice: null });
  assert.deepEqual(bodies, [{ id: "one", name: "Renamed item", targetPrice: 11.99 }, { id: "one", name: "Renamed item", targetPrice: null }]);
  await assert.rejects(api.edit("../invalid", { name: "Item", targetPrice: null }));
  await assert.rejects(api.edit("one", { name: "Item", targetPrice: 0 }));
  assert.equal(bodies.length, 2);
});

test("edit failures reach the caller so the form can preserve unsaved changes", async () => {
  const api = createItemsClient("", async () => Response.json({ error: "Item not found." }, { status: 404 }));
  await assert.rejects(api.edit("missing", { name: "Item", targetPrice: null }), /Item not found/);
});
