import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const productPath = sql`rtrim(substr(url, 1, min(instr(url || '?', '?'), instr(url || '#', '#')) - 1), '/')`;
const productIdentity = sql`substr(${productPath}, length(rtrim(${productPath}, replace(${productPath}, '/', ''))) + 1)`;

export const trackedItems = sqliteTable("tracked_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  productId: text("product_id").generatedAlwaysAs(productIdentity, { mode: "virtual" }),
  itemNumber: text("item_number"),
  imageUrl: text("image_url"),
  clubId: text("club_id"),
  clubName: text("club_name"),
  currentPriceCents: integer("current_price_cents"),
  previousPriceCents: integer("previous_price_cents"),
  targetPriceCents: integer("target_price_cents"),
  lastCheckedAt: text("last_checked_at"),
  archivedAt: text("archived_at"),
  onShoppingList: integer("on_shopping_list", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_tracked_items_product").on(table.productId)]);

export const priceChecks = sqliteTable(
  "price_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: text("item_id")
      .notNull()
      .references(() => trackedItems.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    source: text("source", { enum: ["purchase"] }),
    // Retired address field: backup compatibility only; new writes use clubId/clubName.
    purchaseLocation: text("purchase_location"),
    clubId: text("club_id"),
    clubName: text("club_name"),
    checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_price_checks_item_checked").on(table.itemId, table.checkedAt)],
);

export const itemAliases = sqliteTable("item_aliases", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull().references(() => trackedItems.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  url: text("url").notNull(),
  clubId: text("club_id"),
  clubName: text("club_name"),
  replacesId: text("replaces_id"),
});
