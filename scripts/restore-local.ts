// Restore to a NEW directory; never replaces the running development database.
import { mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { resolve, dirname, basename, join, sep } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { decryptBackup } from "./local-backup-crypto";
const [backupFile, keyFile, destination] = process.argv.slice(2);
if (!backupFile || !keyFile || !destination)
  throw Error("Usage: restore-local BACKUP KEY NEW_DIRECTORY");
const requested = resolve(destination);
const target = join(await realpath(dirname(requested)), basename(requested));
const active = await realpath(resolve("apps/api/.data/postgres")).catch(() =>
  resolve("apps/api/.data/postgres"),
);
if (target === active || target.startsWith(active + sep))
  throw Error("Restore must use a new directory");
await mkdir(target, { mode: 0o700 });
if ((await readdir(target)).length)
  throw Error("Restore destination must be empty");
const bytes = decryptBackup(
  await readFile(resolve(backupFile)),
  await readFile(resolve(keyFile)),
);
const blob = new Blob([new Uint8Array(bytes)]);
const database = new PGlite(target, { loadDataDir: blob });
try {
  await database.waitReady;
  const schema = await database.query(
    "SELECT count(*) AS migrations FROM schema_migrations",
  );
  console.log(
    JSON.stringify({
      restored: true,
      migrations: schema.rows[0],
      destination: target,
    }),
  );
} finally {
  await database.close();
}
