import { parsePurchase } from "./purchase.ts";
import type { Purchase } from "./purchase.ts";
import { APP, isIdentifier } from "./config.ts";
import { CheckError } from "./checks.ts";
import { record, isTrackedItem, isProductPreview, isHistoryPoint, priceToCents, itemEditValues } from "./items.ts";
import type { TrackedItem, ItemInput, ItemEdit, ProductPreview, HistoryPoint } from "./items.ts";

export function createItemsClient(base = "", fetcher: typeof fetch = fetch) {
  async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await fetcher(`${base}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(APP.requestTimeoutMs), cache: "no-store" });
    const data = record(await response.json());
    if (!response.ok || !data) throw new CheckError(typeof data?.error === "string" ? data.error : `The local app returned HTTP ${response.status}.`);
    return data;
  }
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return {
    async merge(sourceId: string, keepId: string): Promise<void> {
      if (!isIdentifier(sourceId) || !isIdentifier(keepId) || sourceId === keepId) throw new CheckError("Choose two different items.");
      await request("/api/items/merge", json("POST", { sourceId, keepId, confirm: true }));
    },
    async purchase(id: string, purchase: Purchase): Promise<void> {
      if (!isIdentifier(id)) throw new CheckError("Choose a valid item.");
      await request("/api/items/purchase", json("POST", { id, purchase: parsePurchase(purchase) }));
    },
    async shoppingList(id: string, onShoppingList: boolean): Promise<void> {
      if (!isIdentifier(id) || typeof onShoppingList !== "boolean") throw new CheckError("Choose a valid item for your shopping list.");
      await request("/api/items", json("PATCH", { id, onShoppingList }));
    },
    async archive(id: string, archived: boolean): Promise<void> {
      if (!isIdentifier(id) || typeof archived !== "boolean") throw new CheckError("Choose a valid item to archive or restore.");
      await request("/api/items", json("PATCH", { id, archived }));
    },
    async history(id: string, signal?: AbortSignal): Promise<HistoryPoint[]> {
      if (!isIdentifier(id)) throw new CheckError("Choose a valid item to view its history.");
      const data = await request(`/api/items/history?id=${encodeURIComponent(id)}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(APP.requestTimeoutMs)]) : undefined });
      if (!Array.isArray(data.history) || !data.history.every(isHistoryPoint)) throw new CheckError("The local app returned invalid price history.");
      return data.history;
    },
    async edit(id: string, input: ItemEdit): Promise<void> {
      if (!isIdentifier(id)) throw new CheckError("Choose a valid item to edit.");
      const values = itemEditValues(input);
      await request("/api/items", json("PATCH", { id, name: values.name, targetPrice: input.targetPrice }));
    },
    async remove(id: string): Promise<void> {
      if (!isIdentifier(id)) throw new CheckError("Choose a valid item to remove.");
      await request(`/api/items?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    async list(includeArchived = false): Promise<TrackedItem[]> {
      const data = await request(includeArchived ? "/api/items?includeArchived=1" : "/api/items");
      if (!Array.isArray(data.items) || !data.items.every(isTrackedItem)) throw new CheckError("The local app returned an invalid watchlist.");
      return data.items;
    },
    async add(input: ItemInput): Promise<{ item: TrackedItem; existing: boolean }> {
      const data = await request("/api/items", json("POST", input));
      if (!isTrackedItem(data.item)) throw new CheckError("The local app did not return the saved item.");
      return { item: data.item, existing: data.existing === true };
    },
    async savePrice(id: string, price: number): Promise<void> {
      if (!isIdentifier(id) || priceToCents(price) === null) throw new CheckError("Only a valid positive price can be saved.");
      await request("/api/items", json("PATCH", { id, price }));
    },
    async preview(url: string): Promise<ProductPreview> {
      const data = await request("/api/preview", json("POST", { url, clubId: APP.clubId }));
      if (!isProductPreview(data.preview)) throw new CheckError("The local app returned invalid product details.");
      return data.preview;
    },
  };
}
