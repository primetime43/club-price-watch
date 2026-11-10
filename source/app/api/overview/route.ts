import { getDb } from "../../../db";
import { readOverview } from "../../../db/overview.ts";
import { APP } from "../../../core/config.ts";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const club = params.get("clubId") ?? APP.clubId;
  if (!/^[1-9]\d{0,5}$/.test(club) || (params.has("includeArchived") && !["0", "1"].includes(params.get("includeArchived")!))) return Response.json({ error: "Choose a valid overview club and archive scope." }, { status: 400 });
  try { return Response.json(await readOverview(getDb(), club, params.get("includeArchived") === "1"), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Could not load the full-history overview. Try again." }, { status: 500 }); }
}
