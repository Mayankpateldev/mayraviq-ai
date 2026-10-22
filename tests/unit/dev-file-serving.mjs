import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import configuration from "../../apps/web/vite.config.ts";
test("Development web server denies private data and keys while serving browser modules", async () => {
  const cache = await mkdtemp(join(tmpdir(), "mayraviq-dev-serving-"));
  const privateDir = resolve("apps/api/.data");
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  const data = join(privateDir, "private-probe-" + randomUUID() + ".txt"),
    key = resolve("apps/api/private-probe-" + randomUUID() + ".key");
  await writeFile(data, "synthetic private storage", { mode: 0o600 });
  await writeFile(key, "synthetic private key", { mode: 0o600 });
  const server = await createServer({
    ...configuration,
    configFile: false,
    root: resolve("apps/web"),
    cacheDir: cache,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      ...configuration.server,
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      hmr: false,
      watch: null,
    },
  });
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert(address && typeof address !== "string");
    const origin = "http://127.0.0.1:" + address.port;
    for (const file of [data, key, resolve("apps/api/src/server.ts")]) {
      const response = await fetch(origin + "/@fs/" + file, { method: "HEAD" });
      assert.equal(response.status, 403);
    }
    const publicModule = await fetch(origin + "/src/main.tsx", {
      method: "HEAD",
    });
    assert.equal(publicModule.status, 200);
    const crossOrigin = await fetch(origin + "/src/main.tsx", {
      method: "HEAD",
      headers: { Origin: "https://untrusted.example" },
    });
    assert.notEqual(
      crossOrigin.headers.get("access-control-allow-origin"),
      "https://untrusted.example",
    );
  } finally {
    await server.close();
    await rm(data, { force: true });
    await rm(key, { force: true });
    await rm(cache, { recursive: true, force: true });
  }
});
