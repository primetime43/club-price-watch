import { parsePurchase } from "./purchase.ts";
import type { Purchase } from "./purchase.ts";
import { APP } from "./config.ts";
import { record, isClubLocation } from "./items.ts";
import { productId } from "./prices.ts";

export interface PurchasedProduct { url: string; name: string; purchase?: Purchase; clubId?: string | null; clubName?: string | null }
export function isOrderPage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && !url.username && !url.password &&
      ["www.bjs.com", "bjs.com"].includes(url.hostname) && /^\/account\/manageOrders(?:\/[a-zA-Z0-9_-]+)?\/?$/.test(url.pathname);
  } catch { return false; }
}
export function purchasedProduct(value: unknown): PurchasedProduct | null {
  const input = record(value);
  if (typeof input?.url !== "string") return null;
  let url: URL;
  try { url = new URL(input.url, APP.bjsHome); } catch { return null; }
  if (!productId(url.href)) return null;
  url.search = ""; url.hash = "";
  let name = typeof input.name === "string" ? input.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\$\s*[\d,]+(?:\.\d{2})?/g, "").replace(/\s+/g, " ").trim() : "";
  if (!name || /^(?:buy (?:it )?again|product(?: image)?|view product)$/i.test(name)) name = url.pathname.split("/")[2]?.replaceAll("-", " ") || "BJ’s product";
  let purchase: Purchase | undefined;
  if (input.purchase !== undefined) { try { purchase = parsePurchase(input.purchase); } catch { return null; } }
  const location = { clubId: input.clubId ?? purchase?.clubId ?? null, clubName: input.clubName ?? purchase?.clubName ?? null };
  if (!isClubLocation(location) || (purchase?.clubId && location.clubId !== purchase.clubId)) return null;
  return { ...(location.clubId ? location : {}), url: url.href, name: name.slice(0, 300), ...(purchase ? { purchase } : {}) };
}
export function purchasedProducts(links: unknown[]): PurchasedProduct[] {
  const products = new Map<string, PurchasedProduct>();
  for (const link of links) {
    const product = purchasedProduct(link);
    if (!product) continue;
    const id = productId(product.url)!;
    const previous = products.get(id);
    // Prefer a named product link over the repeated image link's slug fallback.
    if (!previous || previous.name === new URL(previous.url).pathname.split("/")[2]?.replaceAll("-", " ")) products.set(id, product);
    if (products.size >= 100) break;
  }
  return [...products.values()];
}
