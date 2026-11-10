import { getDb } from "../../../../db";
import { mergeItems } from "../../../../db/merge.ts";
import { isIdentifier } from "../../../../core/config.ts";
import { record } from "../../../../core/items.ts";

export async function POST(request: Request) {
  try {
    const input = record(await request.json());
    if (!input || !isIdentifier(input.sourceId) || !isIdentifier(input.keepId) || input.confirm !== true || Object.keys(input).some(key => !["sourceId", "keepId", "confirm"].includes(key)))
      return Response.json({ error: "Choose both items and confirm the merge." }, { status: 400 });
    return Response.json(await mergeItems(getDb(), input.sourceId, input.keepId));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not merge items." }, { status: 409 }); }
}
