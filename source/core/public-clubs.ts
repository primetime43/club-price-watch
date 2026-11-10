import { APP } from "./config.ts";
import { record } from "./items.ts";
import type { ClubLocation } from "./items.ts";
import { addressKey, clubNumber, clubFromPickup } from "./clubs.ts";

interface PublicClub { clubId: string; clubName: string; address: string; detailUrl: string }
const PUBLIC_SEARCH = "https://api.bjs.com/digital/live/api/v1.2/club/search/10201";

/** Accept only an observed public BJ’s locator link; never arbitrary fetch targets. */
export function pickupLocatorUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, APP.bjsHome);
    if (url.protocol !== "https:" || !["www.bjs.com", "bjs.com"].includes(url.hostname) || url.port || url.username || url.password || !url.pathname.startsWith("/clubLocatorDetail;")) return null;
    const params = new URLSearchParams(url.pathname.slice("/clubLocatorDetail;".length).replaceAll(";", "&"));
    const lat = Number(params.get("lat")), lng = Number(params.get("lng"));
    if (!params.has("lat") || !params.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return new URL(`clubLocatorDetail;radius=25;lat=${lat};lng=${lng}`, APP.bjsHome).href;
  } catch { return null; }
}

/** Read only the public club records embedded in the locator/Club Details HTML. */
export function publicClubs(html: string): PublicClub[] {
  if (html.length > 3 * 1024 * 1024) return [];
  const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(match => /\bid\s*=\s*["']bjs-universal-app-state["']/.test(match[1]));
  if (!script || script[2].length > 2 * 1024 * 1024) return [];
  try {
    const decoded = script[2].replaceAll("&q;", '"').replaceAll("&s;", "'").replaceAll("&l;", "<").replaceAll("&g;", ">").replaceAll("&a;", "&");
    const data = record(JSON.parse(decoded));
    const rows = record(record(data?.[PUBLIC_SEARCH])?.Stores)?.PhysicalStore;
    if (!Array.isArray(rows) || rows.length > 300) return [];
    return rows.flatMap(value => {
      const row = record(value);
      const id = clubNumber(row?.storeName);
      if (!row || !id || clubNumber(row.uniqueID) !== id || !Array.isArray(row.addressLine) || !row.addressLine.length || row.addressLine.length > 3 || !row.addressLine.every(line => typeof line === "string" && line.trim() && line.length <= 100)) return [];
      if (typeof row.city !== "string" || !/^[a-z .'-]{1,100}$/i.test(row.city) || typeof row.stateOrProvinceName !== "string" || !/^[A-Z]{2}$/.test(row.stateOrProvinceName) || typeof row.postalCode !== "string" || !/^\d{5}(?:-\d{4})?$/.test(row.postalCode)) return [];
      const name = Array.isArray(row.Description) ? record(row.Description[0])?.displayStoreName : null;
      if (typeof name !== "string" || !name.trim() || name.length > 90 || /[\u0000-\u001f\u007f]/.test(name)) return [];
      const detailUrl = new URL(`/cl/${row.city.trim().toLowerCase().replace(/\s+/g, "-")}/${String(row.storeName).trim()}`, APP.bjsHome).href;
      return [{ clubId: id, clubName: `${name.trim()}, ${row.stateOrProvinceName}`, address: [...row.addressLine, row.city, row.stateOrProvinceName, row.postalCode].join(" "), detailUrl }];
    });
  } catch { return []; }
}

/** No cookies/account APIs. No nearest-club guesses, fuzzy addresses or 403 retries. */
export async function resolvePublicClubResult(address: string, fetcher: typeof fetch = fetch, locator?: string): Promise<{ club: ClubLocation | null; message: string }> {
  const fail = (message: string) => ({ club: null, message });
  if (typeof address !== "string" || address.length > 300 || /[\u0000-\u001f\u007f]/.test(address)) return fail("Pickup address could not be read.");
  async function load(url: string) {
    const response = await fetcher(url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!response.ok) throw new Error(`Public club lookup returned HTTP ${response.status}. Open BJ’s locator to complete any verification, then Scan again.`);
    return publicClubs(await response.text());
  }
  try {
    if (locator && !pickupLocatorUrl(locator)) return fail("Pickup locator link could not be verified.");
    const clubs = await load(locator ? pickupLocatorUrl(locator)! : new URL("clubLocator", APP.bjsHome).href);
    if (!clubs.length) return fail("Public locator returned no readable club records. Open BJ’s locator, then Scan again.");
    const candidates = clubs.filter(club => addressKey(club.address) === addressKey(address));
    if (candidates.length !== 1) return fail("Pickup address did not match exactly one nearby locator result. Club number remains unknown.");
    const candidate = candidates[0];
    const urlClub = clubFromPickup("", candidate.detailUrl);
    if (urlClub?.clubId !== candidate.clubId) return fail("Club Details link could not be verified.");
    const verified = (await load(candidate.detailUrl)).filter(club => club.clubId === urlClub.clubId && addressKey(club.address) === addressKey(address));
    return verified.length === 1 ? { club: { clubId: verified[0].clubId, clubName: verified[0].clubName }, message: "Pickup club verified." } : fail("Club Details page did not confirm the pickup address and club number.");
  } catch (error) {
    return fail(error instanceof Error && error.message.startsWith("Public club lookup returned HTTP ") ? error.message : "Public club lookup could not connect. Open BJ’s locator, then Scan again.");
  }
}

export async function resolvePublicClub(address: string, fetcher: typeof fetch = fetch): Promise<ClubLocation | null> {
  return (await resolvePublicClubResult(address, fetcher)).club;
}
