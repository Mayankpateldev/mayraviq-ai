import { startMeetingRecapWorker } from "../apps/api/src/modules/meeting/worker";
import { serializedDatabase } from "./serialized-database";
import { backupLocal } from "./local-backup";
// Local-only fallback when Docker/PostgreSQL is unavailable. Production uses pg, never this entry point.
import { mkdir, chmod } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { resolve } from "node:path";
import { Database } from "../apps/api/src/platform/database";
import { migrate } from "../apps/api/src/platform/migrations";
import { importLegacy } from "../apps/api/src/platform/legacy-import";
import { configureRuntime } from "../apps/api/src/platform/runtime";
import { configureAuth } from "../apps/api/src/platform/auth";
import { configuration } from "../apps/api/src/platform/config";
import { application } from "../apps/api/src/application";
if (process.env.NODE_ENV === "production")
  throw Error("Embedded development server cannot run in production");
await mkdir(resolve("apps/api/.data"), { recursive: true, mode: 0o700 });
await chmod(resolve("apps/api/.data"), 0o700);
const db = new PGlite(resolve("apps/api/.data/postgres"));
await db.waitReady;
const localDatabase = serializedDatabase(db);
await migrate(db, resolve("apps/api/migrations"));
if (process.argv[2]) await importLegacy(db, resolve(process.argv[2]));
configureRuntime(
  new Database(localDatabase.executor, localDatabase.acquire),
  true,
);
configureAuth(
  configuration({
    ...process.env,
    DEV_AUTH: "true",
    API_HOST: "127.0.0.1",
    DATABASE_URL: "local-embedded",
    APP_ORIGIN: "http://127.0.0.1:5174",
  }),
);
const stopMeetingWorker = startMeetingRecapWorker();
const server = createServer(async (incoming, outgoing) => {
  try {
    const request = new Request("http://127.0.0.1:5174" + incoming.url, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
      ...(incoming.method === "POST"
        ? {
            body: Readable.toWeb(incoming),
            duplex: "half",
          }
        : {}),
    } as RequestInit);
    const response = await (async () => {
      if (new URL(request.url).pathname === "/__local/backup") {
        if (
          request.method !== "POST" ||
          request.headers.get("authorization") !== "Bearer local-development" ||
          (request.headers.get("origin") &&
            request.headers.get("origin") !== "http://127.0.0.1:5174")
        )
          return Response.json({ error: "Not allowed" }, { status: 403 });
        const { readMutation } =
          await import("../apps/api/src/lib/api-boundary");
        const body = (await readMutation(request)) as { confirmed?: boolean };
        if (body.confirmed !== true)
          return Response.json(
            { error: "Confirmation required" },
            { status: 400 },
          );
        return Response.json(
          await localDatabase.exclusive(() => backupLocal(db)),
        );
      }
      return application(request);
    })();
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end('{"error":"Development server error"}');
  }
});
server.listen(4000, "127.0.0.1", () =>
  console.log("Local embedded PostgreSQL API on 4000; DEV_AUTH enabled"),
);

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => {
      void stopMeetingWorker()
        .then(() => db.close())
        .then(() => process.exit(0));
    });
  });
