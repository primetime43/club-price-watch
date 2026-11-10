import { priceToCents, record } from "./items.ts";
import { clubNumber } from "./clubs.ts";

export interface Purchase { price: number; date: string; clubId?: string; clubName?: string }

/** Legacy backup compatibility only. New purchase writes use clubId/clubName. */
export function purchaseLocation(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Enter a valid pickup club location.");
  const location = value.replace(/\s+/g, " ").trim();
  if (!location || location.length > 300) throw new Error("Enter a pickup club location of at most 300 characters.");
  return location;
}
export function parsePurchase(value: unknown): Purchase {
  const input = record(value);
  const price = input?.price;
  const date = input?.date;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (priceToCents(price) === null || typeof price !== "number" || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001)
    throw new Error("Enter a positive purchase price with at most two decimal places.");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > today)
    throw new Error("Enter the actual purchase date, not a future date.");
  if (input && "location" in input) throw new Error("Reload the extension to import purchase locations by club number.");
  let location: { clubId: string; clubName: string } | undefined;
  if (input?.clubId !== undefined && input.clubId !== null && input.clubId !== "") {
    const clubId = clubNumber(input.clubId);
    const clubName = typeof input.clubName === "string" ? input.clubName.trim() : "";
    if (!clubId || !clubName || clubName.length > 100 || /[\u0000-\u001f\u007f]/.test(clubName)) throw new Error("Enter a valid club number and name, or leave the location unknown.");
    location = { clubId, clubName };
  } else if (input?.clubName !== undefined && input.clubName !== null && input.clubName !== "") {
    throw new Error("A club name requires its club number.");
  }
  return { price, date, ...location };
}

export function orderDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  try { return parsePurchase({ price: 1, date }).date; } catch { return null; }
}

/** Only a single dollar amount in the explicitly labelled Item Price column is accepted. */
export function purchasePrice(text: string): number | null {
  const match = /^\s*\$((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*$/.exec(text);
  const value = match ? Number(match[1].replaceAll(",", "")) : null;
  return priceToCents(value) === null ? null : value;
}
