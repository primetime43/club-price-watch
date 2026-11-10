import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { openSqlite } from "../server/sqlite.ts";

const database = openSqlite(resolve(process.env.CPW_DATA_DIR || "/data", "club-price-watch.sqlite"), resolve("drizzle"));
database.close();
const server = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "start", "--hostname", "0.0.0.0"], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
server.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 0 : 1); });
