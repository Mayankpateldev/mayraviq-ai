import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
const magic = Buffer.from("MYRVBACK1");
export function encryptBackup(data: Uint8Array, key: Uint8Array): Buffer {
  if (key.byteLength !== 32) throw Error("Backup key must be 32 bytes");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(magic);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptBackup(data: Uint8Array, key: Uint8Array): Buffer {
  const source = Buffer.from(data);
  if (
    key.byteLength !== 32 ||
    source.length < 37 ||
    !source.subarray(0, 9).equals(magic)
  )
    throw Error("Invalid encrypted backup");
  const decipher = createDecipheriv("aes-256-gcm", key, source.subarray(9, 21));
  decipher.setAAD(magic);
  decipher.setAuthTag(source.subarray(21, 37));
  return Buffer.concat([
    decipher.update(source.subarray(37)),
    decipher.final(),
  ]);
}
