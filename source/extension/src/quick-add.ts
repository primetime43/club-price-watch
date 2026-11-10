import type { Purchase } from "../../core/purchase.ts";
import type { ClubLocation } from "../../core/items.ts";
import { APP } from "../../core/config.ts";
import { createItemsClient } from "../../core/api.ts";
import { productId } from "../../core/prices.ts";
import { runnerUrl } from "../../core/protocol.ts";
import { getServerOrigin } from "./connection.ts";

export async function quickAdd(url: string, title: string, api?: ReturnType<typeof createItemsClient>, location: ClubLocation = { clubId: null, clubName: null }) {
  const id = productId(url);
  if (!id) throw new Error("Open a BJ’s product page first.");
  api ??= createItemsClient(await getServerOrigin());
  const candidates = (await api.list(true)).filter(item => productId(item.url) === id && (location.clubId === null || item.clubId === null || item.clubId === location.clubId));
  if (candidates.length > 1 && location.clubId === null) throw new Error("This product is tracked at several clubs. Choose its club in the app.");
  const existing = candidates[0];
  if (existing) return { item: existing, existing: true };
  const clean = new URL(url); clean.hash = ""; clean.search = "";
  const name = title.replace(/\s*[|–—]\s*BJ.?s.*$/i, "").trim().slice(0, 300) || clean.pathname.split("/")[2]?.replaceAll("-", " ") || "BJ’s product";
  return api.add({ name, url: clean.href, ...location });
}
export async function addAndCheck(url: string, title: string, purchase?: Purchase, location?: ClubLocation) {
  const result = await navigator.locks.request("cpw-quick-add", async () => {
    const api = createItemsClient(await getServerOrigin());
    const result = await quickAdd(url, title, api, location ?? { clubId: purchase?.clubId ?? null, clubName: purchase?.clubName ?? null });
    if (purchase) await api.purchase(result.item.id, purchase);
    return result;
  });
  if (!result.existing && result.item.clubId) {
    const url = runnerUrl({ itemId: result.item.id, run: true, requestId: crypto.randomUUID() });
    url.searchParams.set("autoClose", "1");
    await chrome.tabs.create({ url: url.href, active: false });
  }
  return result;
}
