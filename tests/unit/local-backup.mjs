import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  encryptBackup,
  decryptBackup,
} from "../../scripts/local-backup-crypto.ts";
test("Encrypted local snapshots restore and reject tampering or the wrong key", async () => {
  const source = new PGlite();
  await source.waitReady;
  await source.exec(
    "CREATE TABLE verification (id integer PRIMARY KEY, content text); INSERT INTO verification VALUES(1,'synthetic restore check');",
  );
  const key = randomBytes(32),
    snapshot = await source.dumpDataDir("gzip");
  await source.close();
  const encrypted = encryptBackup(
    new Uint8Array(await snapshot.arrayBuffer()),
    key,
  );
  assert(!encrypted.includes(Buffer.from("synthetic restore check")));
  assert.throws(() => decryptBackup(encrypted, randomBytes(32)));
  const damaged = Buffer.from(encrypted);
  damaged[damaged.length - 1] ^= 1;
  assert.throws(() => decryptBackup(damaged, key));
  const plain = decryptBackup(encrypted, key),
    restored = new PGlite({ loadDataDir: new Blob([new Uint8Array(plain)]) });
  try {
    await restored.waitReady;
    assert.equal(
      (await restored.query("SELECT content FROM verification WHERE id=1"))
        .rows[0].content,
      "synthetic restore check",
    );
  } finally {
    await restored.close();
  }
});
