// Administrative helpers for the explicit embedded development entry point only.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { encryptBackup } from "./local-backup-crypto";
export async function backupLocal(database: PGlite) {
  const directory = resolve("apps/api/.data/backups"),
    keyFile = resolve("apps/api/.data/backup.key");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let key: Buffer;
  try {
    key = await readFile(keyFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    key = randomBytes(32);
    await writeFile(keyFile, key, { mode: 0o600, flag: "wx" });
  }
  const snapshot = await database.dumpDataDir("gzip");
  if (snapshot.size > 256 * 1024 * 1024)
    throw Error("Local snapshot exceeds the supported size");
  const filename =
    "mayraviq-" + new Date().toISOString().replace(/[:.]/g, "-") + ".encrypted";
  await writeFile(
    resolve(directory, filename),
    encryptBackup(new Uint8Array(await snapshot.arrayBuffer()), key),
    { flag: "wx", mode: 0o600 },
  );
  return { filename, encrypted: true };
}
