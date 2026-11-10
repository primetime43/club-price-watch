import { isWatchlistUrl } from "../../core/config.ts";
import { parseRunnerRequest, runnerUrl } from "../../core/protocol.ts";
import type { MessageSource } from "../../core/protocol.ts";
import { productId } from "../../core/prices.ts";
import { record } from "../../core/items.ts";
import { addAndCheck } from "./quick-add.ts";
import { isOrderPage, purchasedProduct } from "../../core/purchased-items.ts";
import { APP } from "../../core/config.ts";
import { getServerOrigin } from "./connection.ts";
import { resolvePublicClubResult } from "../../core/public-clubs.ts";

export function orderAddProduct(raw: unknown, sender: MessageSource, extensionId: string) {
  const message = record(raw);
  return message?.type === "CPW_ORDER_QUICK_ADD" && sender.id === extensionId && sender.frameId === 0 && isOrderPage(sender.url)
    ? purchasedProduct(message.product) : null;
}

export function orderPickupAddress(raw: unknown, sender: MessageSource, extensionId: string): string | null {
  const message = record(raw);
  return message?.type === "CPW_RESOLVE_PICKUP_CLUB" && sender.id === extensionId && sender.frameId === 0 && isOrderPage(sender.url) &&
    typeof message.address === "string" && Boolean(message.address.trim()) && message.address.length <= 300 && !/[\u0000-\u001f\u007f]/.test(message.address)
    ? message.address.trim() : null;
}

export function validateRunnerSource(sender: MessageSource, extensionId: string, siteOrigin: string = APP.siteOrigin): sender is MessageSource & { tab: { id: number } } {
  return sender.id === extensionId && sender.frameId === 0 && Number.isInteger(sender.tab?.id) && isWatchlistUrl(sender.url, siteOrigin);
}
export function runnerOptions(raw: unknown, sender: MessageSource, extensionId: string, siteOrigin: string = APP.siteOrigin): { url: string; active: boolean } | null {
  const request = parseRunnerRequest(raw);
  return request && validateRunnerSource(sender, extensionId, siteOrigin) ? { url: runnerUrl(request, sender.tab.id).href, active: !request.run } : null;
}
export function registerBackground(browser: Pick<typeof chrome, "runtime" | "tabs">): void {
  browser.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
    const message = record(raw);
    if (message?.type === "CPW_RESOLVE_PICKUP_CLUB") {
      const address = orderPickupAddress(raw, sender, browser.runtime.id);
      if (!address) return false;
      resolvePublicClubResult(address).then(result => respond({ ok: true, ...result }), () => respond({ ok: false }));
      return true;
    }
    if (message?.type === "CPW_ORDER_QUICK_ADD") {
      const product = orderAddProduct(raw, sender, browser.runtime.id);
      if (!product) return false;
      addAndCheck(product.url, product.name, product.purchase)
        .then(result => respond({ ok: true, existing: result.existing, archived: result.item.archivedAt !== null, itemId: result.item.id }), () => respond({ ok: false }));
      return true;
    }
    if (message?.type === "CPW_QUICK_ADD") {
      if (sender.id !== browser.runtime.id || sender.frameId !== 0 || !productId(sender.url)) return false;
      addAndCheck(sender.url!, typeof message.title === "string" ? message.title : "")
        .then(result => respond({ ok: true, existing: result.existing, archived: result.item.archivedAt !== null }), () => respond({ ok: false }));
      return true;
    }
    if (!parseRunnerRequest(raw)) return false;
    getServerOrigin().then(origin => {
      const options = runnerOptions(raw, sender, browser.runtime.id, origin);
      if (!options) throw new Error("Invalid watchlist source.");
      return browser.tabs.create(options);
    })
      .then(() => respond({ ok: true }), () => respond({ ok: false }));
    return true;
  });
}
if (typeof chrome !== "undefined") registerBackground(chrome);
