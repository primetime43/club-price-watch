import { APP } from "./config.ts";
import { record } from "./items.ts";

export type PriceFailure = "invalid-response" | "wrong-club" | "hidden" | "invalid-offer" | "missing-price";
export type PriceReading = { ok: true; price: number; clubId: string } | { ok: false; code: PriceFailure };

export function normalizeClub(value: unknown): string {
  return String(value ?? "").trim().replace(/^0+/, "");
}
export function positivePrice(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}
export function productId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.port === "" && !url.username && !url.password &&
      ["www.bjs.com", "bjs.com"].includes(url.hostname) && url.pathname.startsWith("/product/")
      ? url.pathname.match(/\/(\d{10,})\/?$/)?.[1] ?? null : null;
  } catch { return null; }
}
export function priceUrl(id: string, clubId: string): URL {
  if (!/^[1-9]\d{0,5}$/.test(normalizeClub(clubId))) throw new Error("A recorded club number is required.");
  const url = new URL(APP.priceEndpoint);
  url.search = new URLSearchParams({ productId: id, pageName: "PDP", clubId: normalizeClub(clubId) }).toString();
  return url;
}
export function matchesPriceResponse(value: unknown, id: string, clubId: string): boolean {
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(normalizeClub(clubId))) return false;
  try {
    const url = new URL(value);
    const endpoint = new URL(APP.priceEndpoint);
    return url.origin === endpoint.origin && url.pathname.replace(/\/$/, "") === endpoint.pathname &&
      url.searchParams.get("productId") === id &&
      (!url.searchParams.has("clubId") || normalizeClub(url.searchParams.get("clubId")) === normalizeClub(clubId));
  } catch { return false; }
}

/** The only BJ's club-price parser, used by both the Worker and browser bundle. */
export function readClubPrice(value: unknown, clubId: string): PriceReading {
  if (!/^[1-9]\d{0,5}$/.test(normalizeClub(clubId))) return { ok: false, code: "wrong-club" };
  const root = record(value);
  if (!root) return { ok: false, code: "invalid-response" };
  const entries = Array.isArray(root.bjsClubProduct) ? root.bjsClubProduct : [root.bjsClubProduct];
  const product = entries.map(record).find(entry => {
    if (!entry) return false;
    const primary = entry.clubId;
    const id = primary == null || String(primary).trim() === "" ? entry.clubIdentifier : primary;
    return normalizeClub(id) === normalizeClub(clubId);
  });
  if (!product) return { ok: false, code: "wrong-club" };
  if (String(product.clubPriceVisible).toUpperCase() === "N") return { ok: false, code: "hidden" };
  if (String(product.offerStatusinvalid).toUpperCase() === "Y") return { ok: false, code: "invalid-offer" };
  // clubDisc.clubDiscPrice is a savings amount, never a purchasable price.
  const price = positivePrice(record(product.inClubOfferPrice)?.amount) ?? positivePrice(record(product.clubItemStandardPrice)?.amount);
  return price === null ? { ok: false, code: "missing-price" } : { ok: true, price, clubId: normalizeClub(clubId) };
}
