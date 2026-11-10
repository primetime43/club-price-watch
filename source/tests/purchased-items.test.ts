import assert from "node:assert/strict";
import test from "node:test";
import { isOrderPage, purchasedProduct, purchasedProducts } from "../core/purchased-items.ts";
import { orderAddProduct } from "../extension/src/background.ts";
import { readOrderProducts } from "../extension/src/order-products.ts";
import { extensionManifest } from "../extension/manifest.ts";
import { APP } from "../core/config.ts";
import { PRODUCT_URL } from "./fixtures.ts";

test("purchased-item UI is restricted to BJ’s order pages", () => {
  assert.ok(isOrderPage("https://www.bjs.com/account/manageOrders/example-order"));
  assert.ok(isOrderPage("https://bjs.com/account/manageOrders"));
  for (const url of ["https://example.com/account/manageOrders/test", "http://www.bjs.com/account/manageOrders/test", "https://www.bjs.com/account/payments", PRODUCT_URL, "https://www.bjs.com/account/manageOrdersSomething", "https://user@www.bjs.com/account/manageOrders/test"])
    assert.equal(isOrderPage(url), false);
});

test("only validated product names and canonical links enter purchased-item requests", () => {
  const product = purchasedProduct({ url: PRODUCT_URL + "?tracking=discard#section", name: " Test product $9.99 ", orderNumber: "discard", address: "discard", receiptPrice: 999 });
  assert.deepEqual(product, { url: PRODUCT_URL, name: "Test product" });
  for (const url of ["https://example.com/product/test/3000000000000000000", "javascript:alert(1)", "https://www.bjs.com/account/manageOrders/test", "https://www.bjs.com/product/sku/14526"])
    assert.equal(purchasedProduct({ url, name: "Invalid" }), null);
  assert.equal(purchasedProduct({ url: new URL(PRODUCT_URL).pathname, name: "Product image" })?.url, PRODUCT_URL);
});

test("repeated name/image product links produce one reviewed item and never guess a long ID from a SKU", () => {
  assert.deepEqual(purchasedProducts([
    { url: PRODUCT_URL, name: "Product image" },
    { url: PRODUCT_URL + "?image=1", name: "Named test product" },
    { url: PRODUCT_URL, name: "Named test product" },
    { url: "/product/sku/14526", name: "SKU only" },
  ]), [{ url: PRODUCT_URL, name: "Named test product" }]);
});

test("background rejects purchased-item requests from other tabs, frames and extensions", () => {
  const message = { type: "CPW_ORDER_QUICK_ADD", product: { url: PRODUCT_URL, name: "Named product" } };
  const sender = { id: APP.extensionId, frameId: 0, url: "https://www.bjs.com/account/manageOrders/example-order" };
  assert.deepEqual(orderAddProduct(message, sender, APP.extensionId), message.product);
  for (const patch of [{ id: "other" }, { frameId: 1 }, { url: PRODUCT_URL }, { url: "https://example.com/account/manageOrders/test" }])
    assert.equal(orderAddProduct(message, { ...sender, ...patch }, APP.extensionId), null);
  assert.equal(orderAddProduct({ ...message, product: { url: "https://example.com/", name: "Product" } }, sender, APP.extensionId), null);
});

test("order adapter reads only product anchors and ignores navigation and account-page text", () => {
  const anchor = (url: string, name: string, navigation = false) => ({
    textContent: name,
    getAttribute: (key: string) => key === "href" ? url : null,
    querySelector: () => null,
    closest: () => navigation ? {} : null,
  });
  const root = {
    get textContent() { throw new Error("Account text must not be read"); },
    querySelectorAll: (selector: string) => {
      assert.equal(selector, 'a[href*="/product/"]');
      return [anchor(PRODUCT_URL, "Selected product"), anchor(PRODUCT_URL.replace("6351759", "6351760"), "Navigation product", true)];
    },
  } as unknown as Document;
  assert.deepEqual(readOrderProducts(root), [{ url: PRODUCT_URL, name: "Selected product" }]);
});

test("order picker adds no permissions and never instruments account-page network traffic", () => {
  const manifest = extensionManifest("test");
  assert.deepEqual(manifest.permissions, ["storage"]);
  const order = manifest.content_scripts!.find(script => script.js?.includes("order-picker.js"))!;
  assert.ok(order); assert.equal(order.world, undefined); assert.equal(order.run_at, "document_idle");
  for (const script of manifest.content_scripts!.filter(script => script.world === "MAIN"))
    assert.ok(script.matches!.every(match => match.includes("/product/")));
});
