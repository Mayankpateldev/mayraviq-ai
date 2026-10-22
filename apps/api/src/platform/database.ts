import { Pool } from "pg";

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
  affectedRows?: number;
};
export interface SqlExecutor {
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
}
export type Result = {
  results: Record<string, unknown>[];
  meta: { changes: number };
};
/** Convert our parameterized domain SQL to PostgreSQL without touching string literals. */
export function postgresSql(source: string) {
  let index = 0;
  const ignore = /^\s*INSERT OR IGNORE\b/i.test(source);
  const sql = source
    .replace(/^\s*INSERT OR IGNORE\b/i, "INSERT")
    .replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?|\b(?:key|window)\b/g, (token) =>
      token === "?"
        ? `$${++index}`
        : ["key", "window"].includes(token)
          ? `"${token}"`
          : token,
    );
  return ignore ? sql + " ON CONFLICT DO NOTHING" : sql;
}
export class Statement {
  constructor(
    readonly database: Database,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Statement(this.database, this.sql, values);
  }
  async execute(executor: SqlExecutor): Promise<Result> {
    const value = await executor.query(postgresSql(this.sql), this.values);
    return {
      results: value.rows,
      meta: { changes: value.rowCount ?? value.affectedRows ?? 0 },
    };
  }
  run() {
    return this.execute(this.database.executor);
  }
  all() {
    return this.run();
  }
  async first<T = Record<string, unknown>>() {
    return ((await this.run()).results[0] as T | undefined) ?? null;
  }
}
export class Database {
  constructor(
    readonly executor: SqlExecutor,
    private readonly acquire?: () => Promise<SqlExecutor & { release(): void }>,
  ) {}
  prepare(sql: string) {
    return new Statement(this, sql);
  }
  async batch(statements: Statement[]) {
    // SERIALIZABLE prevents a stale optimistic update from writing a misleading audit row.
    for (let attempt = 0; attempt < 4; attempt++) {
      const client = this.acquire ? await this.acquire() : this.executor;
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const results: Result[] = [];
        for (const statement of statements)
          results.push(await statement.execute(client));
        await client.query("COMMIT");
        return results;
      } catch (error) {
        await client.query("ROLLBACK");
        const code = (error as { code?: string }).code;
        if (attempt === 3 || !["40001", "40P01"].includes(code || ""))
          throw error;
      } finally {
        if (this.acquire)
          (client as SqlExecutor & { release(): void }).release();
      }
    }
    throw Error("Transaction retry exhausted");
  }
}
export function createDatabase(url: string) {
  const pool = new Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
  pool.on("error", () => console.error("Database pool connection failed"));
  return {
    database: new Database(pool, () => pool.connect()),
    close: () => pool.end(),
  };
}
