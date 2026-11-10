import { pickupLocatorUrl } from "../../core/public-clubs.ts";
import { clubFromPickup } from "../../core/clubs.ts";
import type { ClubLocation } from "../../core/items.ts";
import { orderDate } from "../../core/purchase.ts";

export interface OrderDetails { date: string | null; location: ClubLocation | null; pickupAddress?: string; pickupLocatorUrl?: string }
const fieldName = (node: Node) => (node.textContent ?? "").replace(/:/g, "").replace(/\s+/g, " ").trim().toLowerCase();
function fieldText(node: Node): string {
  return node.nodeType === 3 ? node.textContent ?? "" : [...node.childNodes].map(fieldText).join(" ");
}

function addressSiblings(start: Node): string | null {
  const parts: string[] = [];
  let node: Node | null = start;
  for (let count = 0; node && count < 6; count++, node = node.nextSibling) {
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.matches('br')) continue;
      if (!element.matches('a, span, div, p') || element.querySelectorAll('*').length > 6 || element.querySelector('strong, b, h1, h2, h3, h4, input, table')) break;
    } else if (node.nodeType !== 3) continue;
    parts.push(fieldText(node));
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 300) return null;
    if (/\b[A-Z]{2}\s*\d{5}(?:-\d{4})?$/.test(text)) return text;
  }
  return null;
}

/** Only inspect the small value immediately following an exact, known field label. */
function fieldValue(label: Element): { text: string; href?: string | null } | null {
  let field: Node = [...label.childNodes].find(node => node.nodeType === 3 && /^(order date|pick ?up location)$/.test(fieldName(node))) ?? label;
  const pickup = /^pick ?up location$/.test(fieldName(field));
  for (let level = 0; level < 3; level++) {
    let next = field.nextSibling;
    for (let count = 0; next && count < 6; count++, next = next.nextSibling) {
      if (next.nodeType === 3) {
        const value = pickup ? addressSiblings(next) ?? next.textContent?.replace(/\s+/g, " ").trim() : next.textContent?.replace(/\s+/g, " ").trim();
        if (value) return value.length <= 300 ? { text: value } : null;
      } else if (next.nodeType === 1) {
        const element = next as Element;
        if (element.matches('br, svg, i, [aria-hidden="true"]')) continue;
        if (element.matches('input, table, section, fieldset, header, nav, aside, footer') || element.querySelectorAll('*').length > 6 || element.querySelector('input, table, section, fieldset, h1, h2, h3, h4, strong, b')) return null;
        // Preserve separation between an address's lines without collecting a whole order block.
        const value = (pickup ? addressSiblings(element) : null) ?? fieldText(element).replace(/\s+/g, " ").trim();
        if (value) return value.length <= 300 ? { text: value, href: (element.matches("a") ? element : element.querySelector("a"))?.getAttribute("href") } : null;
      }
    }
    const parent = field.parentElement;
    if (!parent || parent.matches('body, main, section, fieldset, header, nav, aside, footer') || parent.querySelectorAll('*').length > 8) break;
    field = parent;
  }
  return null;
}

/** XPath returns only exact labels, so unrelated account/order text is never collected. */
export function readOrderDetails(root: Document = document): OrderDetails {
  const name = "normalize-space(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ:', 'abcdefghijklmnopqrstuvwxyz'))";
  const matches = root.evaluate(`//text()[${name} = 'order date' or ${name} = 'pick up location' or ${name} = 'pickup location']/parent::*`, root, null, 7, null);
  const dates = new Set<string>(); const locations = new Map<string, ClubLocation>();
  let unresolvedLocation = false;
  const addresses = new Set<string>(); const locatorLinks = new Set<string>();
  for (let i = 0; i < matches.snapshotLength; i++) {
    const label = matches.snapshotItem(i) as Element;
    if (label.closest('header, nav, aside, footer, [role="navigation"]')) continue;
    // Label text nodes only, excluding any nested value or icon.
    const name = [...label.childNodes].filter(node => node.nodeType === 3).map(fieldName).find(text => /^(order date|pick ?up location)$/.test(text));
    const value = fieldValue(label);
    if (!value) continue;
    if (name === "order date") { const date = orderDate(value.text); if (date) dates.add(date); }
    else if (/^pick ?up location$/.test(name ?? "")) {
      addresses.add(value.text);
      const locator = pickupLocatorUrl(value.href); if (locator) locatorLinks.add(locator);
      const location = clubFromPickup(value.text, value.href);
      if (location?.clubId) locations.set(location.clubId, location);
      else unresolvedLocation = true;
    }
  }
  return { date: dates.size === 1 ? [...dates][0] : null, location: !unresolvedLocation && locations.size === 1 ? [...locations.values()][0] : null,
    ...(unresolvedLocation && locatorLinks.size === 1 ? { pickupLocatorUrl: [...locatorLinks][0] } : {}),
    ...(unresolvedLocation && locations.size === 0 && addresses.size === 1 ? { pickupAddress: [...addresses][0] } : {}) };
}
