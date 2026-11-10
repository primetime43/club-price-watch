import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { createItemsClient } from "../core/api.ts";

const origin = "http://127.0.0.1:3301";
const api = createItemsClient(origin);
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(`${origin}/api/items`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) { ready = true; break; }
  } catch { /* The production server may still be starting. */ }
  await setTimeout(250);
}
assert.ok(ready, "The production container API did not become ready.");
assert.equal((await fetch(origin)).status, 200);
let id: string | undefined;
try {
  const added = await api.add({ name: "Container verification", url: "https://www.bjs.com/product/container-verification/3000000000098765432", currentPrice: 12.34, targetPrice: 10 });
  assert.equal(added.existing, false);
  id = added.item.id;
  await api.savePrice(id, 11.99);
  await api.shoppingList(id, true);
  assert.deepEqual((await api.history(id)).map(point => point.priceCents), [1234, 1199]);
  await api.archive(id, true);
  assert.equal((await api.list()).some(item => item.id === id), false);
  await assert.rejects(api.savePrice(id, 1), /archived/);
  const backup = await (await fetch(`${origin}/api/backup`)).json();
  assert.equal(backup.items[0].onShoppingList, true);
  assert.ok(backup.items[0].archivedAt);
  await api.archive(id, false);
  const [item] = await api.list();
  assert.equal(item.currentPriceCents, 1199);
  assert.equal(item.previousPriceCents, 1234);
  assert.equal(item.targetPriceCents, 1000);
  assert.equal(item.onShoppingList, true);
  console.log("Production homepage, API, price/history saves, shopping list, archive/restore and backup passed.");
} finally { if (id) await api.remove(id); }
