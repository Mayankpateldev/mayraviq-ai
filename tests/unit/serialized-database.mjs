import test from "node:test";
import assert from "node:assert/strict";
import { serializedDatabase } from "../../scripts/serialized-database.ts";
test("Local transaction locks hold SQL only and release queued reads", async () => {
  const events = [];
  const db = serializedDatabase({
    query: async (sql) => {
      events.push(sql);
      return { rows: [] };
    },
  });
  const transaction = await db.acquire();
  await transaction.query("BEGIN");
  const read = db.executor.query("READ");
  await transaction.query("WRITE");
  assert.deepEqual(events, ["BEGIN", "WRITE"]);
  await transaction.query("COMMIT");
  transaction.release();
  await read;
  assert.deepEqual(events, ["BEGIN", "WRITE", "COMMIT", "READ"]);
  await assert.rejects(
    db.exclusive(async () => {
      throw Error("failed snapshot");
    }),
  );
  await db.executor.query("RECOVERED");
  assert.equal(events.at(-1), "RECOVERED");
});
