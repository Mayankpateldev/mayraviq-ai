import { DatabaseSync } from "node:sqlite";
import type { SqlExecutor } from "./database";
export const legacyTables = [
  "workspaces",
  "projects",
  "sessions",
  "decisions",
  "audit",
  "canvases",
  "workspace_members",
  "workspace_invites",
  "conversations",
  "conversation_members",
  "messages",
  "room_canvases",
  "room_guests",
  "room_invites",
  "request_limits",
];
/** One-time, read-only SQLite import into an empty migrated PostgreSQL database. */
export async function importLegacy(target: SqlExecutor, source: string) {
  const sqlite = new DatabaseSync(source, { readOnly: true });
  await target.query("BEGIN");
  try {
    for (const table of legacyTables) {
      if ((await target.query(`SELECT 1 FROM "${table}" LIMIT 1`)).rows.length)
        throw Error(
          "Import requires an empty target database; existing data was not overwritten",
        );
    }
    for (const table of legacyTables) {
      const columns = sqlite
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((row) => String(row.name));
      if (!columns.length) continue;
      const identifiers = columns
        .map((c) => '"' + c.replaceAll('"', '""') + '"')
        .join(",");
      const placeholders = columns.map((_, i) => "$" + (i + 1)).join(",");
      for (const row of sqlite.prepare(`SELECT * FROM "${table}"`).iterate()) {
        await target.query(
          `INSERT INTO "${table}" (${identifiers}) VALUES (${placeholders})`,
          columns.map((c) => row[c]),
        );
      }
    }
    await target.query("COMMIT");
  } catch (error) {
    await target.query("ROLLBACK");
    throw error;
  } finally {
    sqlite.close();
  }
}
