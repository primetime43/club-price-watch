import type { TrackedItem } from "../core/items.ts";
export const PRODUCT_ID = "3000000000006351759";
export const PRODUCT_URL = `https://www.bjs.com/product/test-product/${PRODUCT_ID}`;
export const NONCE = "01234567-89ab-4cde-8fab-0123456789ab";
export const saleProduct = {
  clubId: "555", clubIdentifier: "555", clubPriceVisible: "Y", offerStatusinvalid: "N",
  inClubOfferPrice: { amount: 367.99, currency: "USD" }, clubDisc: { clubDiscPrice: 132 }, clubItemStandardPrice: { amount: 499.99 },
};
export function item(overrides: Partial<TrackedItem> = {}): TrackedItem {
  return { id: "tracked-one", name: "Test product", url: PRODUCT_URL, itemNumber: null, imageUrl: null,
    clubId: "555", clubName: "Test club", currentPriceCents: null, previousPriceCents: null, targetPriceCents: null, lastCheckedAt: null, archivedAt: null, onShoppingList: false, history: [], ...overrides };
}
export const priceMessage = { type: "CPW_PRICE_RESULT", nonce: NONCE, productId: PRODUCT_ID, clubId: "0555", status: 200, price: 367.99, error: null };

import { addItem as addRecordedItem } from "../db/add-item.ts";
export const TEST_CLUB = { clubId: "555", clubName: "Test club" };
export const addItem: typeof addRecordedItem = (db, input, location = TEST_CLUB) => addRecordedItem(db, input, location);
