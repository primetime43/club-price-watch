import { record } from "../../core/items.ts";
import { parseResults } from "../../core/protocol.ts";

export function quickAddResult(value: unknown, itemId: string): string | null {
  const result = parseResults(record(value)?.results)?.find(result => result.id === itemId);
  if (!result) return null;
  if (result.status === "recorded") return "Added to your watchlist. Price saved.";
  if (result.status === "tested") return "Added to your watchlist. Test finished; no price was saved.";
  return `Added, but the price check failed: ${result.error || "Open the checker to retry."}`;
}

type ResultStorage = Pick<typeof chrome.storage, "local" | "onChanged">;
export function watchQuickAddResult(itemId: string, show: (message: string) => void, storage: ResultStorage = chrome.storage): () => void {
  let active = true;
  let changed = false;
  const publish = (value: unknown) => {
    const message = quickAddResult(value, itemId);
    if (active && message) show(message);
  };
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !changes.lastRun) return;
    changed = true;
    publish(changes.lastRun.newValue);
  };
  storage.onChanged.addListener(listener);
  // Read after subscribing so completion during popup startup cannot be missed.
  void storage.local.get("lastRun").then(value => { if (!changed) publish(value.lastRun); }).catch(() => {});
  return () => { active = false; storage.onChanged.removeListener(listener); };
}
