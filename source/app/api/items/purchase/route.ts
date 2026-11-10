import { getDb } from "../../../../db";
import { savePurchase } from "../../../../db/purchase.ts";
import { record } from "../../../../core/items.ts";
import { isIdentifier } from "../../../../core/config.ts";

export async function POST(request: Request) {
  try {
    const input = record(await request.json());
    if (!input || !isIdentifier(input.id) || Object.keys(input).some(key => !["id", "purchase"].includes(key)))
      return Response.json({ error: "Choose a valid item and purchase." }, { status: 400 });
    return await savePurchase(getDb(), input.id, input.purchase) ? Response.json({ ok: true }) : Response.json({ error: "Item not found." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save purchase." }, { status: 400 });
  }
}
