import type { Database } from "../platform/database";
import { RequestError } from "./api-boundary.ts";
/** A database-backed fixed window survives Worker restarts and multiple isolates. */
export async function enforceRateLimit(
  db: Database,
  userId: string,
  scope: string,
  limit = 120,
  now = Date.now(),
) {
  const window = Math.floor(now / 60000);
  const result = await db
    .prepare(
      `INSERT INTO request_limits(key,window,hits) VALUES(?,?,1)
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN request_limits.window!=excluded.window THEN 1 ELSE request_limits.hits+1 END,window=excluded.window
 WHERE request_limits.window!=excluded.window OR request_limits.hits<?`,
    )
    .bind(scope + ":" + userId, window, limit)
    .run();
  if (!result.meta.changes)
    throw new RequestError(
      "Too many requests. Please wait a minute and retry.",
      429,
    );
}
