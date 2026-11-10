import { getDb } from "../../../../db";
import { readItemHistory } from "../../../../db/history.ts";
import { isIdentifier } from "../../../../core/config.ts";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!isIdentifier(id)) return Response.json({ error: "Choose a valid item." }, { status: 400 });
  try {
    const history = await readItemHistory(getDb(), id);
    if (history === null) return Response.json({ error: "Item not found." }, { status: 404 });
    return Response.json({ history }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not load price history. Please try again." }, { status: 500 });
  }
}
