import { Pool } from "pg";
import { migrate } from "./migrations";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await migrate(client);
  console.log("Database migrations complete");
} finally {
  client.release();
  await pool.end();
}
