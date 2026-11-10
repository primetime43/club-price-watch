import assert from "node:assert/strict";
import test from "node:test";
import { readDisplayedOrderPrice } from "../extension/src/order-products.ts";
import { PRODUCT_URL } from "./fixtures.ts";

const rect = (left: number, top: number, width: number, height: number) => ({ left, right: left + width, top, bottom: top + height, width, height });
test("displayed order grid reads only Item Price for the product, excluding quantity, SKU and total", () => {
  const heading = { closest: () => null, getBoundingClientRect: () => rect(400, 100, 80, 30) };
  const cell = (left: number, text: string, readable: boolean) => ({ children: [], closest: () => null,
    getBoundingClientRect: () => rect(left, 150, 80, 30),
    get textContent() { if (!readable) throw Error("Unrelated order columns must not be read"); return text; },
  });
  const cells = [cell(100, "Product", false), cell(300, "12345", false), cell(400, "$1.49", true), cell(500, "3", false), cell(600, "$4.47", false)];
  const link = { href: PRODUCT_URL, getAttribute: () => PRODUCT_URL, getBoundingClientRect: () => rect(100, 150, 150, 30), parentElement: null as unknown,
    ownerDocument: { evaluate: () => ({ snapshotLength: 1, snapshotItem: () => heading }) } };
  const row = { getBoundingClientRect: () => rect(100, 140, 700, 100), contains: () => false, parentElement: null,
    get textContent(): string { throw Error("Whole row must not be read"); },
    querySelectorAll: (selector: string) => selector === '*' ? cells : [link],
  };
  link.parentElement = row;
  assert.equal(readDisplayedOrderPrice(link as unknown as HTMLAnchorElement), 1.49);
  cells[2] = cell(400, "$0.00", true);
  assert.equal(readDisplayedOrderPrice(link as unknown as HTMLAnchorElement), null);
});
