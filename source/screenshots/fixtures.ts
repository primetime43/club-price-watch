import type { TrackedItem } from "../core/items.ts";

// Entirely invented documentation data. Never seed the application database.
export function screenshotItems(now = Date.now()): TrackedItem[] {
  const club = { clubId: "999999", clubName: "Demo Club (fictional)" };
  const samples = [
    { name: "Organic coffee beans, 2 lb", prices: [1599, 1699, 1599, 1499, 1599, 1399, 1499, 1299], target: 1299, shopping: true },
    { name: "Extra virgin olive oil, 2 L", prices: [1899, 1999, 2099, 1999, 1899, 1999, 2099, 2199], target: 1899, shopping: false },
    { name: "Rolled oats, 10 lb", prices: [1099, 1099, 999, 1099, 1049, 999, 999, 899], target: 999, shopping: true },
    { name: "Paper towels, 12 rolls", prices: [2199, 2299, 2199, 2099, 2199, 2099, 2299, 1999], target: 1999, shopping: true },
    { name: "Roasted almonds, 3 lb", prices: [1399, 1399, 1499, 1399, 1299, 1399, 1399, 1399], target: 1199, shopping: false },
    { name: "Sparkling water, 24 cans", prices: [899, 949, 999, 949, 899, 849, 899, 799], target: 799, shopping: false },
  ];
  return samples.map((sample, index) => {
    const history = sample.prices.map((priceCents, point) => ({
      ...club, priceCents, id: index * 100 + point + 1,
      checkedAt: new Date(now - (7 - point) * 21 * 86400000 - 2 * 3600000).toISOString(),
      source: point === 0 ? "purchase" as const : null,
      purchaseLocation: point === 0 ? club.clubName : null,
    }));
    return {
      ...club, id: `demo-item-${index + 1}`, name: sample.name,
      url: `https://example.invalid/demo-product-${index + 1}`,
      itemNumber: null, imageUrl: null,
      currentPriceCents: sample.prices.at(-1)!, previousPriceCents: sample.prices.at(-2)!,
      targetPriceCents: sample.target, lastCheckedAt: history.at(-1)!.checkedAt,
      archivedAt: null, onShoppingList: sample.shopping, history,
    };
  });
}
