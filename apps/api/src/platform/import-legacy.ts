import { Pool } from "pg";
import { resolve } from "node:path";
import { importLegacy } from "./legacy-import";
if (!process.env.DATABASE_URL || !process.argv[2])
  throw Error("Set DATABASE_URL and pass the legacy SQLite path");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await importLegacy(client, resolve(process.argv[2]));
  console.log("Legacy data imported; original SQLite preserved");
} finally {
  client.release();
  await pool.end();
}
