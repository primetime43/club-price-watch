import type { Purchase } from "../../core/purchase.ts";
import { APP } from "../../core/config.ts";
import { createItemsClient } from "../../core/api.ts";
import { productId } from "../../core/prices.ts";
import { runnerUrl } from "../../core/protocol.ts";
import { getServerOrigin } from "./connection.ts";

export async function quickAdd(url: string, title: string, api?: ReturnType<typeof createItemsClient>) {
  const id = productId(url);
  if (!id) throw new Error("Open a BJ’s product page first.");
  api ??= createItemsClient(await getServerOrigin());
  const existing = (await api.list(true)).find(item => productId(item.url) === id && (item.clubId === null || item.clubId === APP.clubId));
  if (existing) return { item: existing, existing: true };
  const clean = new URL(url); clean.hash = ""; clean.search = "";
  const name = title.replace(/\s*[|–—]\s*BJ.?s.*$/i, "").trim().slice(0, 300) || clean.pathname.split("/")[2]?.replaceAll("-", " ") || "BJ’s product";
  return api.add({ name, url: clean.href });
}
export async function addAndCheck(url: string, title: string, purchase?: Purchase) {
  const result = await navigator.locks.request("cpw-quick-add", async () => {
    const api = createItemsClient(await getServerOrigin());
    const result = await quickAdd(url, title, api);
    if (purchase) await api.purchase(result.item.id, purchase);
    return result;
  });
  if (!result.existing) {
    const url = runnerUrl({ itemId: result.item.id, run: true, requestId: crypto.randomUUID() });
    url.searchParams.set("autoClose", "1");
    await chrome.tabs.create({ url: url.href, active: false });
  }
  return result;
}
