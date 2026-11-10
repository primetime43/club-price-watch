import assert from "node:assert/strict";
import test from "node:test";
import { readOrderDetails } from "../extension/src/order-details.ts";

// Small DOM fixtures expose only the label and its adjacent field. Access to page text throws.
function element(tag: string, children: (string | Element)[] = [], href?: string): Element {
  const childNodes = children.map(child => typeof child === "string" ? { nodeType: 3, textContent: child, nextSibling: null, parentElement: null } : child);
  const node = {
    nodeType: 1, childNodes, parentElement: null, nextSibling: null,
    get textContent() { return childNodes.map(child => child.textContent).join(""); },
    matches: (selector: string) => selector.split(",").map(s => s.trim()).includes(tag),
    closest: () => null,
    getAttribute: (key: string) => key === "href" ? href ?? null : null,
    querySelectorAll: (_selector: string): Element[] => childNodes.filter(child => child.nodeType === 1).flatMap(child => [child as Element, ...(child as Element).querySelectorAll("*")]),
    querySelector: (selector: string) => node.querySelectorAll("*").find(child => child.matches(selector)) ?? null,
  };
  for (let i = 0; i < childNodes.length; i++) {
    Object.assign(childNodes[i], { parentElement: node, nextSibling: childNodes[i + 1] ?? null });
  }
  return node as unknown as Element;
}
function documentWith(labels: Element[]): Document {
  return {
    get textContent(): string { throw Error("Never collect account/body text"); },
    evaluate: (query: string) => {
      assert.ok(query.startsWith("//text()["));
      assert.ok(query.includes("'order date'"));
      assert.ok(query.includes("'pick up location'"));
      assert.ok(!query.includes("pickup time"));
      return { snapshotLength: labels.length, snapshotItem: (index: number) => labels[index] };
    },
  } as unknown as Document;
}

test("order details read labeled date and linked pickup location across icon/line breaks", () => {
  const date = element("strong", ["Order Date"]);
  const location = element("span", ["Pick Up Location"]);
  element("div", [element("i"), date, element("br"), element("span", ["01/05/2026"])]);
  element("div", [element("i"), location, element("a", ["100 Example Road", element("br"), "Example City, PA 15000"], "https://www.bjs.com/cl/example-club/0111/")]);
  assert.deepEqual(readOrderDetails(documentWith([date, location])), { date: "2026-01-05", location: { clubId: "111", clubName: "Example Club" } });
});

test("order details support inline values and leave missing/ambiguous dates or clubs for review", () => {
  const inline = element("div", [" Order   Date : ", element("br"), "01/05/2026"]);
  assert.deepEqual(readOrderDetails(documentWith([inline])), { date: "2026-01-05", location: null });
  const otherDate = element("b", ["Order Date"]);
  element("div", [otherDate, "01/06/2026"]);
  const first = element("b", ["Pickup Location"]), second = element("b", ["Pickup Location"]);
  element("div", [first, element("a", ["Example club one"])]);
  element("div", [second, element("a", ["Example club two"])]);
  assert.deepEqual(readOrderDetails(documentWith([inline, otherDate, first, second])), { date: null, location: null });
  assert.deepEqual(readOrderDetails(documentWith([])), { date: null, location: null });
});

test("a known club elsewhere on the page cannot substitute for an unresolved pickup location", () => {
  const first = element("b", ["Pickup Location"]), second = element("b", ["Pickup Location"]);
  element("div", [first, "Club #111"]);
  element("div", [second, element("a", ["Unverified address"])]);
  assert.deepEqual(readOrderDetails(documentWith([first, second])), { date: null, location: null });
});

test("nested pickup address lines retain spaces between city, state and ZIP for locator matching", () => {
  const location = element("span", ["Pick Up Location"]);
  element("div", [location, element("a", [element("span", ["100 Example Road"]), element("br"), element("span", ["Example City,", element("span", ["PA"]), element("span", ["15000"])])])]);
  assert.deepEqual(readOrderDetails(documentWith([location])), { date: null, location: null, pickupAddress: "100 Example Road Example City, PA 15000" });
});

test("pickup street and city in separate sibling lines form one bounded public address", () => {
  const location = element("span", ["Pick Up Location"]);
  element("div", [location, element("a", ["100 Example Road"]), element("br"), element("a", ["Example City, PA15000"])]);
  assert.deepEqual(readOrderDetails(documentWith([location])), { date: null, location: null, pickupAddress: "100 Example Road Example City, PA15000" });
});
