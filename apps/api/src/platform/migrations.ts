import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { SqlExecutor } from "./database";
export async function migrate(
  db: SqlExecutor & { exec?: (sql: string) => Promise<unknown> },
  directory = resolve("migrations"),
) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  // Caller uses one dedicated connection, never a pool across BEGIN/COMMIT.
  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock(70491237)");
    for (const name of (await readdir(directory))
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const existing = await db.query(
        "SELECT name FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (existing.rows.length) continue;
      const sql = await readFile(resolve(directory, name), "utf8");
      if (db.exec) await db.exec(sql);
      else await db.query(sql);
      await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
