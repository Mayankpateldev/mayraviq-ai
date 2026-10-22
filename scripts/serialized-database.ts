import type { SqlExecutor } from "../apps/api/src/platform/database";
/** Serialize SQL and complete transactions, without blocking HTTP/model work. */
export function serializedDatabase(database: SqlExecutor) {
  let pending: Promise<unknown> = Promise.resolve();
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = pending.then(fn);
    pending = next.catch(() => {});
    return next;
  }
  const executor: SqlExecutor = {
    query: (sql, values) => exclusive(() => database.query(sql, values)),
  };
  async function acquire() {
    const before = pending;
    let release!: () => void;
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await before;
    return { query: database.query.bind(database), release };
  }
  return { executor, acquire, exclusive };
}
