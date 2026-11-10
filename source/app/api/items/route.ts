import { and, isNull, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { priceChecks, trackedItems } from "../../../db/schema";
import type { ItemInput } from "../../../core/items.ts";
import { priceToCents, record, itemEditValues, archiveValue, shoppingListValue } from "../../../core/items.ts";
import { isIdentifier } from "../../../core/config.ts";
import { addItem } from "../../../db/add-item.ts";
import { listItems, setArchived } from "../../../db/archive.ts";
import { saveItemPrice } from "../../../db/save-price.ts";
import { setShoppingList } from "../../../db/shopping-list.ts";
const cents = (value: unknown) => priceToCents(value);

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  if (message.includes("no such table") || message.includes("D1 binding")) {
    return "Price history is being prepared. Please try again in a moment.";
  }
  return message;
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const items = await listItems(db, new URL(request.url).searchParams.get("includeArchived") === "1");
    const ids = items.map((item) => item.id);
    const checks = ids.length
      ? await db
          .select()
          .from(priceChecks)
          .where(inArray(priceChecks.itemId, ids))
          .orderBy(desc(sql`julianday(${priceChecks.checkedAt})`), desc(priceChecks.id))
      : [];

    return Response.json({
      items: items.map((item) => ({
        ...item,
        history: checks.filter((check) => check.itemId === item.id).slice(0, 60).reverse(),
      })),
    });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as ItemInput;
    const result = await addItem(getDb(), input);
    return Response.json(result, { status: result.existing ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const input = record(await request.json());
    if (!input || !isIdentifier(input.id)) return Response.json({ error: "Choose a valid item." }, { status: 400 });
    if ("clubId" in input && !("price" in input)) {
      if (Object.keys(input).some(key => !["id", "clubId", "clubName"].includes(key)) || typeof input.clubId !== "string" || !/^[1-9]\d{0,5}$/.test(input.clubId) || typeof input.clubName !== "string" || !input.clubName.trim() || input.clubName.length > 100) return Response.json({ error: "Provide only a valid club number and name." }, { status: 400 });
      const result = await getDb().update(trackedItems).set({ clubId: input.clubId, clubName: input.clubName.trim() }).where(and(eq(trackedItems.id, input.id), isNull(trackedItems.clubId))).returning({ id: trackedItems.id });
      return result.length ? Response.json({ ok: true }) : Response.json({ error: "Item is missing or already has a club. Refresh and retry." }, { status: 409 });
    }
    if ("onShoppingList" in input) {
      const onShoppingList = shoppingListValue(input);
      return await setShoppingList(getDb(), input.id, onShoppingList) ? Response.json({ ok: true }) : Response.json({ error: "Item not found." }, { status: 404 });
    }
    if ("archived" in input) {
      const archived = archiveValue(input);
      return await setArchived(getDb(), input.id, archived) ? Response.json({ ok: true }) : Response.json({ error: "Item not found." }, { status: 404 });
    }
    if ("name" in input || "targetPrice" in input) {
      if ("price" in input) return Response.json({ error: "Edit item details separately from price checks." }, { status: 400 });
      const values = itemEditValues(input);
      const updated = await getDb().update(trackedItems).set(values).where(eq(trackedItems.id, input.id)).returning({ id: trackedItems.id });
      return updated.length ? Response.json({ ok: true }) : Response.json({ error: "Item not found." }, { status: 404 });
    }
    const priceCents = cents(input.price);
    if (!input.id || priceCents === null) {
      return Response.json({ error: "Choose an item and enter its current price." }, { status: 400 });
    }

    if (typeof input.clubId !== "string" || !/^[1-9]\d{0,5}$/.test(input.clubId)) return Response.json({ error: "A recorded club number is required for a checked price." }, { status: 400 });
    const result = await saveItemPrice(getDb(), input.id, priceCents, input.clubId);
    if (result === "missing-club") return Response.json({ error: "This item has no recorded club. Import a verified location before checking." }, { status: 409 });
    if (result === "missing") return Response.json({ error: "Item not found." }, { status: 404 });
    if (result === "archived") return Response.json({ error: "This item is archived. Restore it from Archived before checking its price." }, { status: 409 });
    if (result === "other-club") return Response.json({ error: "The item’s recorded club changed or differs from this check. Refresh and retry." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Item id is required." }, { status: 400 });
    const db = getDb();
    await db.batch([
      db.delete(priceChecks).where(eq(priceChecks.itemId, id)),
      db.delete(trackedItems).where(eq(trackedItems.id, id)),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 400 });
  }
}
