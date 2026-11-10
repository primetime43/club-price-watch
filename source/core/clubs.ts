import { APP } from "./config.ts";
import type { ClubLocation } from "./items.ts";

export function clubNumber(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value.trim())) return null;
  const id = String(Number(value.trim()));
  return id !== "0" ? id : null;
}

export function clubNameForId(id: string): string {
  return `Club ${id}`;
}

export const addressKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  .replace(/\b([a-z]{2})(\d{5})\b/g, "$1 $2")
  .replace(/\bdrive\b/g, "dr").replace(/\broad\b/g, "rd").replace(/\bstreet\b/g, "st");

/** Direct club identities only. Addresses must be matched against public locator records. */
export function clubFromPickup(text: string, href?: string | null): ClubLocation | null {
  const candidates = new Map<string, ClubLocation>();
  const explicit = /^(?:BJ['’]?s\s+)?(?:club|store)\s*(?:number|no\.?|#|:)?\s*(\d{1,6})$/i.exec(text.trim());
  const id = clubNumber(explicit?.[1]);
  if (id) candidates.set(id, { clubId: id, clubName: clubNameForId(id) });
  if (href) {
    try {
      const url = new URL(href, APP.bjsHome);
      const match = /^\/cl\/([a-z0-9-]+)\/(\d{1,6})\/?$/i.exec(url.pathname);
      const id = clubNumber(match?.[2]);
      if (id && url.protocol === "https:" && ["www.bjs.com", "bjs.com"].includes(url.hostname) && !url.port && !url.username && !url.password) {
        const name = match![1].replaceAll("-", " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 100);
        candidates.set(id, { clubId: id, clubName: name });
      }
    } catch { /* An unrecognized map link is not a club identity. */ }
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}
