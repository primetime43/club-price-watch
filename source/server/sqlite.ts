import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The existing Drizzle D1 queries run against plain SQLite in the container. */
export function sqliteBinding(sqlite: DatabaseSync, beforeStatement: (sql: string) => void = () => {}) {
  const prepare = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: SQLInputValue[]) => prepare(sql, values),
    execute() {
      beforeStatement(sql);
      const results = sqlite.prepare(sql).all(...params);
      return { success: true, results };
    },
    async all() { return this.execute(); },
    async raw() { return this.execute().results.map(row => Object.values(row)); },
    async run() { return this.execute(); },
    async first(column?: string) { const row = this.execute().results[0]; return column ? row?.[column] ?? null : row ?? null; },
  });
  return {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      // No await inside the transaction: other requests cannot interleave statements.
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
    async exec(sql: string) { sqlite.exec(sql); return { count: 0, duration: 0 }; },
  } as unknown as D1Database;
}

export function migrateSqlite(sqlite: DatabaseSync, migrationDir: string) {
  sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  sqlite.exec("CREATE TABLE IF NOT EXISTS cpw_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const name of readdirSync(migrationDir).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort()) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      if (!sqlite.prepare("SELECT name FROM cpw_migrations WHERE name = ?").get(name)) {
        sqlite.exec(readFileSync(resolve(migrationDir, name), "utf8"));
        sqlite.prepare("INSERT INTO cpw_migrations (name) VALUES (?)").run(name);
      }
      sqlite.exec("COMMIT");
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }
}

export function openSqlite(filename: string, migrationDir: string) {
  mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  try {
    sqlite.exec("PRAGMA journal_mode=WAL;");
    migrateSqlite(sqlite, migrationDir);
    return { binding: sqliteBinding(sqlite), close: () => sqlite.close() };
  } catch (error) { sqlite.close(); throw error; }
}
