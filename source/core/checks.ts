import { APP, isIdentifier } from "./config.ts";
import type { CheckItem } from "./items.ts";
import { productId, positivePrice } from "./prices.ts";

export class CheckError extends Error {}
export type CheckOutcome =
  | { id: string; name: string; status: "recorded" | "tested"; price: number }
  | { id: string; name: string; status: "failed"; price: null; error: string };
export type CheckResult = Pick<CheckOutcome, "id" | "status"> & { error?: string };
export interface CheckState {
  status: "waiting" | "checking" | "saved" | "failed" | "tested";
  message: string;
  updatedAt: number;
  startedAt?: number;
}

export function itemCheckState(item: { currentPriceCents: number | null; lastCheckedAt: string | null }, state?: CheckState, now = Date.now()): CheckState {
  if (state) {
    if ((state.status === "waiting" || state.status === "checking") && now - state.updatedAt > APP.jobTimeoutMs)
      return { status: "failed", message: "The checker stopped responding. Check its tab and retry.", updatedAt: state.updatedAt };
    return state;
  }
  return item.currentPriceCents !== null && item.lastCheckedAt
    ? { status: "saved", message: "The last recorded price is saved.", updatedAt: Date.parse(item.lastCheckedAt) }
    : { status: "waiting", message: "No price saved yet. Choose Check price to start.", updatedAt: now };
}

export function selectCheckItems<T extends CheckItem>(items: T[], id: string | null): T[] {
  if (id === null) return items;
  if (!isIdentifier(id)) throw new CheckError("The selected item is invalid. Reopen the checker from your watchlist.");
  const selected = items.filter(item => item.id === id);
  if (!selected.length) throw new CheckError("This item is no longer in the watchlist. Refresh it and retry.");
  return selected;
}
export function failureMessage(error: unknown): string {
  return error instanceof CheckError ? error.message : "The price could not be checked or saved. Check your connection and retry.";
}
export interface CheckDependencies {
  items: CheckItem[];
  dryRun: boolean;
  readPrice: (item: CheckItem) => Promise<number>;
  savePrice: (id: string, price: number, clubId: string) => Promise<void>;
  report?: (message: string) => void;
  progress?: (itemId: string, status: "checking" | "saved" | "tested" | "failed", message: string) => Promise<void>;
}
export async function checkItems({ items, dryRun, readPrice, savePrice, report = () => {}, progress = async () => {} }: CheckDependencies): Promise<CheckOutcome[]> {
  const results: CheckOutcome[] = [];
  for (const item of items) {
    if (!isIdentifier(item.id) || !productId(item.url)) continue;
    report(`Checking ${item.name}…`);
    try {
      if (!item.clubId || !/^[1-9]\d{0,5}$/.test(item.clubId)) throw new CheckError("This item has no recorded club. Import it with a verified location or set its club before checking.");
      await progress(item.id, "checking", `Reading the Club ${item.clubId} price in your browser…`).catch(() => {});
      const price = await readPrice(item);
      if (typeof price !== "number" || positivePrice(price) === null) throw new CheckError("No valid price was returned. No price was saved.");
      if (!dryRun) await savePrice(item.id, price, item.clubId);
      results.push({ id: item.id, name: item.name, price, status: dryRun ? "tested" : "recorded" });
      await progress(item.id, dryRun ? "tested" : "saved", dryRun ? "Test passed. No price was saved." : "Price checked and saved.").catch(() => {});
      report(`${dryRun ? "Verified" : "Recorded"} $${price.toFixed(2)} for ${item.name}.`);
    } catch (error) {
      const message = failureMessage(error);
      results.push({ id: item.id, name: item.name, price: null, status: "failed", error: message });
      await progress(item.id, "failed", message).catch(() => {});
      report(`Skipped ${item.name}: ${message}`);
    }
  }
  return results;
}
