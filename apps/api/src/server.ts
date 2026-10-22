import { startMeetingRecapWorker } from "./modules/meeting/worker";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { configuration } from "./platform/config";
import { configureAuth } from "./platform/auth";
import { configureRuntime } from "./platform/runtime";
import { createDatabase } from "./platform/database";
import { application } from "./application";
const config = configuration();
const { database, close } = createDatabase(config.databaseUrl);
configureAuth(config);
configureRuntime(database, config.devAuth && !config.production);
const stopMeetingWorker = startMeetingRecapWorker();
const server = createServer(
  { maxHeaderSize: 16384, requestTimeout: 15000, headersTimeout: 10000 },
  async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers))
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(",") : value);
      const origin = headers.get("origin");
      if (origin && origin !== config.origin) {
        outgoing.writeHead(403, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        outgoing.end('{"error":"Request origin is not allowed."}');
        return;
      }
      if (origin) {
        outgoing.setHeader("Access-Control-Allow-Origin", config.origin);
        outgoing.setHeader("Vary", "Origin");
      }
      if (incoming.method === "OPTIONS") {
        outgoing.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, x-workspace-id",
          "Access-Control-Max-Age": "600",
        });
        outgoing.end();
        return;
      }
      // Construct URL from trusted configuration; forwarded/Host headers do not set the security origin.
      const path = incoming.url || "/";
      if (!path.startsWith("/") || path.startsWith("//")) {
        outgoing.writeHead(400);
        outgoing.end();
        return;
      }
      const request = new Request(config.origin + path, {
        method: incoming.method,
        headers,
        ...(incoming.method !== "GET" && incoming.method !== "HEAD"
          ? {
              body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
              duplex: "half",
            }
          : {}),
      } as RequestInit);
      const response = await application(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => {
        outgoing.setHeader(
          key,
          key === "vary" && origin ? value + ", Origin" : value,
        );
      });
      outgoing.setHeader("X-Frame-Options", "DENY");
      outgoing.setHeader("Referrer-Policy", "no-referrer");
      if (config.production)
        outgoing.setHeader("Strict-Transport-Security", "max-age=31536000");
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      console.log(
        JSON.stringify({
          method: incoming.method,
          path: new URL(request.url).pathname,
          status: response.status,
        }),
      );
    } catch {
      console.error("Request processing failed");
      if (!outgoing.headersSent)
        outgoing.writeHead(500, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
      outgoing.end('{"error":"Service unavailable."}');
    }
  },
);
server.listen(config.port, config.host, () =>
  console.log(`API listening on ${config.host}:${config.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => {
      void stopMeetingWorker()
        .then(close)
        .then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
