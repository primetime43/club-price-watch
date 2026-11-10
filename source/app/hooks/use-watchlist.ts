"use client";
import { useCallback, useEffect, useState } from "react";
import { createItemsClient } from "../../core/api.ts";

import type { TrackedItem } from "../../core/items.ts";

export const itemsClient = createItemsClient();
export function useWatchlist() {
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await itemsClient.list(true);

      setItems(items);
      setError(null);
    } catch {
      setError("Could not refresh the watchlist. Your last loaded prices are shown.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 100);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    // Extension checks can save without a check started in this app tab.
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    return () => { clearTimeout(timer); clearInterval(poll); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [refresh]);
  return { items, loading, error, refresh };
}
