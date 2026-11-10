import { isIdentifier } from "../../core/config.ts";
import { isClubLocation } from "../../core/items.ts";
import { isOrderPage } from "../../core/purchased-items.ts";
import { productId } from "../../core/prices.ts";
import { clubNumber, clubNameForId } from "../../core/clubs.ts";
import { parsePurchase } from "../../core/purchase.ts";
import { readOrderPrices, readOrderProducts } from "./order-products.ts";
import { readOrderDetails } from "./order-details.ts";
import { watchQuickAddResult } from "./quick-add-result.ts";

if (isOrderPage(location.href) && window === window.top) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:2147483647";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `:host{all:initial;font:14px/1.5 system-ui;color:#211b1d}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}button,a{outline-offset:3px}.launcher,.primary{background:#c70940;color:#fff;border:0;border-radius:10px;padding:12px 16px;font-weight:700}.launcher{box-shadow:0 4px 24px #0003}.panel{width:min(440px,calc(100vw - 32px));max-height:75vh;overflow:auto;background:#fff;border:1px solid #ddd;border-radius:14px;padding:20px;box-shadow:0 6px 40px #0004}.panel[hidden],.launcher[hidden]{display:none}h2{margin:0 30px 10px 0;font-size:21px}p{font-size:13px;color:#655d60;margin:10px 0}.close{float:right;border:0;background:none;font-size:23px}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0}.secondary{border:1px solid #ddd;background:#fff;border-radius:8px;padding:8px 12px}.row{display:grid;grid-template-columns:auto 1fr;gap:10px;border-top:1px solid #eee;padding:12px 0}.row input{margin-top:5px}.row label{display:block;cursor:pointer}.row a{color:#211b1d;text-decoration:underline}.result{font-size:12px;color:#4b6256;margin-top:5px}.help{background:#f5f1ee;padding:10px;border-radius:8px}`;
  const launcher = document.createElement("button"); launcher.className = "launcher"; launcher.textContent = "+ Track purchased items";
  const panel = document.createElement("section"); panel.className = "panel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Track purchased items");
  const close = document.createElement("button"); close.className = "close"; close.textContent = "×"; close.setAttribute("aria-label", "Close");
  const heading = document.createElement("h2"); heading.textContent = "Track purchased items";
  const intro = document.createElement("p"); intro.textContent = "Review the product links found on this page and choose what to track.";
  const note = document.createElement("p"); note.className = "help"; note.textContent = "New products are checked at their imported pickup club. Items without a verified club need a club number before checking. Optional purchase prices go into history with the order date and pickup club shown below. Review Item Price (per unit), not Total Price. Clear a price to skip it. Keep the Price Watch app running.";
  const dateLabel = document.createElement("label"); dateLabel.textContent = "Order date ";
  dateLabel.style.display = "block";
  const purchaseDate = document.createElement("input"); purchaseDate.type = "date"; dateLabel.append(purchaseDate);
  const locationLabel = document.createElement("label"); locationLabel.textContent = "Pickup club number ";
  locationLabel.style.cssText = "display:block;margin-top:10px";
  const purchaseClub = document.createElement("input"); purchaseClub.type = "text"; purchaseClub.inputMode = "numeric"; purchaseClub.maxLength = 6; purchaseClub.pattern = "[0-9]{1,6}"; purchaseClub.placeholder = "Unknown"; locationLabel.append(purchaseClub);
  let detectedClub: { clubId: string | null; clubName: string | null } | null = null;
  const detection = document.createElement("p"); detection.setAttribute("role", "status");
  const dateHelp = document.createElement("p"); dateHelp.textContent = "Order date is filled from the page. The pickup address is matched against nearby public locator results and verified on the Club Details page. If no match is verified, enter the club number if known or leave it unknown. Review before importing one order at a time. Reimporting the same item, date, price and club number does not add another record.";
  const actions = document.createElement("div"); actions.className = "actions";
  const all = document.createElement("button"); all.className = "secondary"; all.textContent = "Select all";
  const scan = document.createElement("button"); scan.className = "secondary"; scan.textContent = "Scan again";
  const list = document.createElement("div");
  const add = document.createElement("button"); add.className = "primary"; add.textContent = "Track selected"; add.disabled = true;
  const summary = document.createElement("p"); summary.setAttribute("role", "status");
  const rows = new Map<string, { url: string; name: string; input: HTMLInputElement; price: HTMLInputElement; result: HTMLElement }>();
  const subscriptions = new Map<string, () => void>();
  let busy = false;
  let resolvingClub = false; let lookupEpoch = 0; let clubRevision = 0;
  purchaseClub.addEventListener("input", () => { clubRevision++; });
  const update = () => { const count = [...rows.values()].filter(row => row.input.checked && !row.input.disabled).length; add.textContent = busy ? "Adding selected products…" : resolvingClub ? "Finding pickup club…" : `Track selected (${count})`; add.disabled = busy || resolvingClub || count === 0; };
  function render() {
    if (busy) return;
    for (const stop of subscriptions.values()) stop(); subscriptions.clear();
    rows.clear(); list.replaceChildren();
    const details = readOrderDetails();
    const epoch = ++lookupEpoch; resolvingClub = false;
    purchaseDate.value = details.date ?? ""; detectedClub = details.location; purchaseClub.value = details.location?.clubId ?? "";
    detection.textContent = `${details.date ? "Order date detected" : "Order date not detected — enter it below"} · ${details.location ? `Pickup club ${details.location.clubId} verified` : "Pickup club number not verified — enter it if known, or leave unknown"}.`;
    if (!details.location && details.pickupAddress) {
      resolvingClub = true;
      const revision = clubRevision;
      detection.textContent = "Finding the pickup address in the public club locator…";
      void chrome.runtime.sendMessage({ type: "CPW_RESOLVE_PICKUP_CLUB", address: details.pickupAddress, locatorUrl: details.pickupLocatorUrl }).then(response => {
        if (epoch !== lookupEpoch) return;
        if (revision !== clubRevision) { detection.textContent = "Pickup club number entered manually. Review before importing."; return; }
        const club = response?.ok && isClubLocation(response.club) && response.club.clubId ? response.club : null;
        detectedClub = club; purchaseClub.value = club?.clubId ?? "";
        detection.textContent = club ? `Pickup club ${club.clubId} · ${club.clubName} verified against its address and Club Details page.` : typeof response?.message === "string" && response.message.length <= 250 ? response.message : "Public club lookup unavailable. Enter the club number if known, or leave unknown.";
      }).catch(() => {
        if (epoch === lookupEpoch) detection.textContent = "Public club lookup unavailable. Enter the club number if known, or leave unknown.";
      }).finally(() => { if (epoch === lookupEpoch) { resolvingClub = false; update(); } });
    }
    const prices = readOrderPrices();
    for (const product of readOrderProducts()) {
      const id = productId(product.url)!;
      const row = document.createElement("div"); row.className = "row";
      const input = document.createElement("input"); input.type = "checkbox"; input.id = "cpw-purchase-" + id; input.addEventListener("change", update);
      const body = document.createElement("div");
      const label = document.createElement("label"); label.htmlFor = input.id; label.textContent = product.name;
      const link = document.createElement("a"); link.href = product.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "View product"; link.style.fontSize = "12px";
      const result = document.createElement("div"); result.className = "result"; result.setAttribute("role", "status");
      const priceLabel = document.createElement("label"); priceLabel.textContent = "Purchase unit price $ ";
      const price = document.createElement("input"); price.type = "number"; price.min = "0.01"; price.step = "0.01"; price.style.width = "100px"; price.placeholder = "Optional";
      const detected = prices.get(id); if (detected !== undefined) price.value = detected.toFixed(2);
      priceLabel.append(price);
      body.append(label, link, priceLabel, result); row.append(input, body); list.append(row);
      rows.set(id, { ...product, input, price, result });
    }
    summary.textContent = rows.size ? `${rows.size} unique product link(s) found. Nothing is added until you choose Track selected.` : "No product links found yet. Wait for the page to finish loading, then choose Scan again. You can also open a product and add it from the extension menu.";
    all.disabled = rows.size === 0; update();
  }
  const open = () => { if (!isOrderPage(location.href)) return; launcher.hidden = true; panel.hidden = false; render(); close.focus(); };
  close.onclick = () => { panel.hidden = true; launcher.hidden = false; launcher.focus(); };
  panel.addEventListener("keydown", event => { if (event.key === "Escape") close.click(); });
  launcher.onclick = open; scan.onclick = render;
  all.onclick = () => { const selectable = [...rows.values()].filter(row => !row.input.disabled); const select = !selectable.every(row => row.input.checked); for (const row of selectable) row.input.checked = select; update(); };
  add.onclick = async () => {
    if (busy || resolvingClub) return;
    const purchases = new Map<string, ReturnType<typeof parsePurchase>>();
    try {
      for (const [id, row] of rows) if (row.input.checked) {
        if (!row.price.validity.valid) throw new Error("Review the purchase unit price for each selected item.");
        if (!purchaseClub.validity.valid) throw new Error("Enter a valid pickup club number, or leave it unknown.");
        const clubId = purchaseClub.value.trim() ? clubNumber(purchaseClub.value) : null;
        if (purchaseClub.value.trim() && !clubId) throw new Error("Enter a valid pickup club number, or leave it unknown.");
        const clubName = clubId ? detectedClub?.clubId === clubId ? detectedClub.clubName! : clubNameForId(clubId) : null;
        if (row.price.value.trim()) purchases.set(id, parsePurchase({ price: Number(row.price.value), date: purchaseDate.value, ...(clubId ? { clubId, clubName } : {}) }));
      }
    } catch (error) { summary.textContent = error instanceof Error ? error.message : "Review purchase prices and date."; return; }
    busy = true; purchaseDate.disabled = purchaseClub.disabled = true; scan.disabled = all.disabled = true; update();
    let added = 0; let existing = 0; let failed = 0;
    const selected = [...rows.entries()].filter(([, row]) => row.input.checked && !row.input.disabled);
    for (const [, row] of rows) { row.input.disabled = true; row.price.disabled = true; }
    for (const [id, row] of selected) {
      row.result.textContent = "Adding…";
      try {
        const response = await chrome.runtime.sendMessage({ type: "CPW_ORDER_QUICK_ADD", product: { url: row.url, name: row.name, ...(purchaseClub.value.trim() ? { clubId: clubNumber(purchaseClub.value), clubName: detectedClub?.clubId === clubNumber(purchaseClub.value) ? detectedClub.clubName : clubNameForId(clubNumber(purchaseClub.value)!) } : {}), ...(purchases.has(id) ? { purchase: purchases.get(id) } : {}) } });
        if (!response?.ok || !isIdentifier(response.itemId)) throw new Error();
        if (response.existing) { existing++; row.result.textContent = response.archived ? "Archived · restore from watchlist" : "Already watching ✓"; }
        else { added++; row.result.textContent = response.needsClub ? "Added · set club in watchlist before checking" : "Added · checking price…"; }
        if (purchases.has(id)) row.result.textContent += " · purchase saved to history";
        row.input.checked = false;
        subscriptions.get(id)?.();
        if (response.archived || response.existing || response.needsClub) continue;
        subscriptions.set(id, watchQuickAddResult(response.itemId, message => { row.result.textContent = message + (purchases.has(id) ? " · purchase saved to history" : ""); }));
      } catch { failed++; row.result.textContent = "Could not finish import. Check the app connection and server update, then retry. Saved purchases will not be duplicated."; }
    }
    busy = false; purchaseDate.disabled = purchaseClub.disabled = false; scan.disabled = all.disabled = false;
    for (const row of rows.values()) { row.input.disabled = false; row.price.disabled = false; }
    summary.textContent = `${added} added · ${existing} already saved (including archived) · ${failed} could not be added. Failed selections can be retried.`;
    update();
  };
  actions.append(all, scan); panel.append(close, heading, intro, note, detection, dateLabel, locationLabel, dateHelp, actions, list, add, summary); shadow.append(style, launcher, panel); document.body.append(host);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL("popup.html") && message?.type === "CPW_OPEN_ORDER_PICKER") { open(); respond({ ok: true }); }
  });
  window.addEventListener("unload", () => { for (const stop of subscriptions.values()) stop(); });
}
