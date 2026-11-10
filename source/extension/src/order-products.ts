import { purchasedProducts } from "../../core/purchased-items.ts";
import { productId } from "../../core/prices.ts";
import { purchasePrice } from "../../core/purchase.ts";

/** Read only the labelled unit-price cell. Never read whole order rows/account text. */
export function readOrderPrice(link: HTMLAnchorElement): number | null {
  const row = link.closest('tr, [role="row"]');
  const table = row?.closest('table, [role="table"], [role="grid"]');
  if (!row || !table) return readDisplayedOrderPrice(link);
  const headers = [...table.querySelectorAll('thead th, [role="columnheader"]')];
  const index = headers.findIndex(header => /^item price$/i.test(header.textContent?.trim() ?? ""));
  if (index < 0 || headers.filter(header => /^item price$/i.test(header.textContent?.trim() ?? "")).length !== 1) return readDisplayedOrderPrice(link);
  const cells = [...row.querySelectorAll(':scope > td, :scope > [role="cell"], :scope > [role="gridcell"]')];
  return cells.length === headers.length ? purchasePrice(cells[index]?.textContent ?? "") : null;
}

/** Div-based desktop order grids: read only the cell under the exact Item Price heading. */
export function readDisplayedOrderPrice(link: HTMLAnchorElement): number | null {
  if (typeof link.getBoundingClientRect !== "function") return null;
  const doc = link.ownerDocument;
  const headings = doc.evaluate("//text()[normalize-space(.) = 'Item Price']/parent::*", doc, null, 7, null);
  const values = new Set<number>();
  for (let i = 0; i < headings.snapshotLength; i++) {
    const heading = headings.snapshotItem(i) as Element;
    if (heading.closest('header, nav, aside, footer')) continue;
    const box = heading.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const x = (box.left + box.right) / 2;
    const linkBox = link.getBoundingClientRect();
    let row = link.parentElement;
    for (let depth = 0; row && depth < 8; depth++, row = row.parentElement) {
      const bounds = row.getBoundingClientRect();
      if (bounds.top < box.bottom || bounds.height > 400 || row.contains(heading)) break;
      if (bounds.left > x || bounds.right < x) continue;
      const ids = new Set([...row.querySelectorAll<HTMLAnchorElement>('a[href*="/product/"]')].map(a => {
        try { return productId(new URL(a.getAttribute("href") ?? "", "https://www.bjs.com").href); } catch { return null; }
      }).filter(Boolean));
      if (ids.size !== 1 || !ids.has(productId(link.href))) break;
      for (const cell of row.querySelectorAll('*')) {
        // Geometry is inspected before text. Other columns and whole rows are never read.
        if (cell.children.length || cell.closest('button, a, script, style')) continue;
        const rect = cell.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.left > x || rect.right < x || rect.top < bounds.top || rect.bottom > bounds.bottom || rect.bottom < linkBox.top || rect.top > linkBox.bottom + 40) continue;
        const price = purchasePrice(cell.textContent ?? "");
        if (price !== null) values.add(price);
      }
      break;
    }
  }
  return values.size === 1 ? [...values][0] : null;
}

/** Prices are optional suggestions; unsupported markup requires explicit entry in review. */
export function readOrderPrices(root: Document = document): Map<string, number> {
  const prices = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href*="/product/"]')) {
    if (link.closest('header, nav, footer, aside, [role="navigation"]')) continue;
    let id: string | null;
    try { id = productId(new URL(link.getAttribute("href") ?? "", "https://www.bjs.com").href); } catch { continue; }
    const price = readOrderPrice(link);
    if (!id || price === null) continue;
    if (prices.has(id) && prices.get(id) !== price) ambiguous.add(id);
    prices.set(id, price);
  }
  for (const id of ambiguous) prices.delete(id);
  return prices;
}

/** Product discovery reads only product anchors, not row or account text. */
export function readOrderProducts(root: Document = document) {
  return purchasedProducts([...root.querySelectorAll<HTMLAnchorElement>('a[href*="/product/"]')]
    .filter(link => !link.closest('header, nav, footer, aside, [role="navigation"]'))
    .map(link => ({ url: link.getAttribute("href"), name: link.getAttribute("aria-label") || link.getAttribute("title") || link.textContent?.trim() || link.querySelector("img")?.getAttribute("alt") || "" })));
}
