import { getDb } from "../../../db";
import { exportBackup, restoreBackup } from "../../../db/backup.ts";
import { BACKUP_MAX_BYTES, BackupError, parseBackup } from "../../../core/backup.ts";
import { record } from "../../../core/items.ts";

export async function GET() {
  try {
    const backup = await exportBackup(getDb());
    const contents = JSON.stringify(backup, null, 2);
    if (new TextEncoder().encode(contents).byteLength > BACKUP_MAX_BYTES) throw new BackupError("This backup exceeds the 20 MB file limit.");
    return new Response(contents, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="club-price-watch-${new Date().toISOString().slice(0, 10)}.json"` } });
  } catch (error) {
    return Response.json({ error: error instanceof BackupError ? error.message : "Could not export your backup. Check that the local app is running and retry." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("Content-Length")) > BACKUP_MAX_BYTES) return Response.json({ error: "Backup files must be 20 MB or smaller." }, { status: 413 });
    const contents = await request.text();
    if (new TextEncoder().encode(contents).byteLength > BACKUP_MAX_BYTES) return Response.json({ error: "Backup files must be 20 MB or smaller." }, { status: 413 });
    let input: Record<string, unknown> | null;
    try { input = record(JSON.parse(contents)); } catch { throw new BackupError("Choose a valid backup file."); }
    if (!input || (input.mode !== "missing" && input.mode !== "replace")) throw new BackupError("Choose a restore mode.");
    if (input.mode === "replace" && input.confirmReplace !== true) throw new BackupError("Confirm replacing the current watchlist first.");
    const backup = parseBackup(input.backup);
    return Response.json(await restoreBackup(getDb(), backup, input.mode));
  } catch (error) {
    return Response.json({ error: error instanceof BackupError ? error.message : "Restore could not finish. No partial import was saved. Retry when price checks have finished." }, { status: error instanceof BackupError ? 400 : 500 });
  }
}
