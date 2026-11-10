import { productId } from "../../core/prices.ts";
import { runnerUrl } from "../../core/protocol.ts";
import { button, element } from "./dom.ts";
import { addAndCheck } from "./quick-add.ts";
import { watchQuickAddResult } from "./quick-add-result.ts";
import { createItemsClient } from "../../core/api.ts";
import { isOrderPage } from "../../core/purchased-items.ts";
import { getServerOrigin } from "./connection.ts";

button("open").addEventListener("click", () => { void getServerOrigin().then(url => chrome.tabs.create({ url })).catch(() => chrome.runtime.openOptionsPage()); });
button("check").addEventListener("click", () => { void chrome.tabs.create({ url: runnerUrl().href }); });
button("server").addEventListener("click", () => { void chrome.runtime.openOptionsPage(); });
element("version").textContent = `Loaded version ${chrome.runtime.getManifest().version}`;
button("reload").addEventListener("click", () => chrome.runtime.reload());
const add = button("add");
const status = element("status");
let stopWatching = () => {};
const watch = (id: string) => {
  stopWatching();
  stopWatching = watchQuickAddResult(id, message => { status.textContent = message; });
};
window.addEventListener("unload", () => stopWatching());
chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
  if (isOrderPage(tab?.url) && tab?.id !== undefined) {
    add.textContent = "Track purchased items"; add.disabled = false;
    status.textContent = "Choose products from this order without importing receipt prices or order details.";
    add.addEventListener("click", async () => {
      try {
        const response = await chrome.tabs.sendMessage(tab.id!, { type: "CPW_OPEN_ORDER_PICKER" }, { frameId: 0 });
        if (!response?.ok) throw new Error();
        window.close();
      } catch { status.textContent = "Refresh this order page after applying the extension update, then retry."; }
    });
    return;
  }
  if (!productId(tab?.url)) { status.textContent = "Open a BJ’s product to quick-add it here."; return; }
  status.textContent = tab.title || "BJ’s product";
  try {
    const existing = (await createItemsClient(await getServerOrigin()).list(true)).find(item => productId(item.url) === productId(tab.url));
    if (existing) {
      if (existing.archivedAt !== null) {
        add.textContent = "Archived";
        status.textContent = "Open your watchlist, choose Archived, then Restore to track this product again. Its history is kept.";
        return;
      }
      add.textContent = "Already watching ✓";
      status.textContent = existing.currentPriceCents === null ? "In your watchlist. Open the checker to see progress or retry its price check." : "In your watchlist. Last saved price: " + new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(existing.currentPriceCents / 100);
      watch(existing.id);
      return;
    }
  } catch { /* Adding can still be retried if the initial read failed. */ }
  add.disabled = false;
  add.addEventListener("click", async () => {
    add.disabled = true;
    status.textContent = "Adding to your watchlist…";
    try {
      const result = await addAndCheck(tab.url!, tab.title || "");
      if (result.item.archivedAt !== null) {
        add.textContent = "Archived";
        status.textContent = "Restore this product from Archived in your watchlist. Its history is kept.";
        return;
      }
      add.textContent = "Added to watchlist ✓";
      if (!result.item.clubId) { status.textContent = "Added. Set this item’s recorded club number in the app before checking."; return; }
      status.textContent = result.existing ? "Already in your watchlist." : "Added. Its first price check is running in another tab.";
      watch(result.item.id);
    } catch { status.textContent = "Could not add this product. Check your connection and retry."; add.disabled = false; }
  });
}).catch(() => { status.textContent = "Reopen this menu on a BJ’s product page."; });
