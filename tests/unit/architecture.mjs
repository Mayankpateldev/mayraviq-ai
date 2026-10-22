import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) result.push(path);
  }
  return result;
}
test("Browser and contract code cannot import the API or server libraries", async () => {
  for (const root of [
    resolve("apps/web/src"),
    resolve("packages/contracts/src"),
  ]) {
    for (const file of await files(root)) {
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(
        /\b(?:from|import)\s*(?:\(\s*)?["']([^"']+)["']/g,
      )) {
        const specifier = match[1];
        assert.ok(
          !/^(node:|cloudflare:|pg$|jose$|@mayraviq\/api)/.test(specifier),
          `Server dependency in ${relative(process.cwd(), file)}`,
        );
        if (specifier.startsWith(".")) {
          const destination = resolve(dirname(file), specifier);
          assert.ok(
            !relative(root, destination).startsWith(".."),
            `Import escapes browser/contract boundary: ${relative(process.cwd(), file)}`,
          );
        }
      }
    }
  }
});
