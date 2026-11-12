import fs from "fs";
import path from "path";
import { Pool, PoolClient, types as pgTypes } from "pg";

const NUMERIC_OID = 1700;
const DATE_OID = 1082;
const TIMESTAMPTZ_OID = 1184;

// Return values in the same shapes the app uses: money as numbers,
// dates as "YYYY-MM-DD", timestamps as ISO strings.
const typeParsers = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === NUMERIC_OID) return (v: string) => Number(v);
    if (oid === DATE_OID) return (v: string) => v;
    if (oid === TIMESTAMPTZ_OID) return (v: string) => new Date(v).toISOString();
    return pgTypes.getTypeParser(oid, format as "text");
  },
};

const globalForPool = globalThis as unknown as { __dirhamPulsePool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__dirhamPulsePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. See .env.example.");
    }
    globalForPool.__dirhamPulsePool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      types: typeParsers,
    });
  }
  return globalForPool.__dirhamPulsePool;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Applies db/schema.sql (idempotent). Serialized across app instances by an advisory lock. */
export async function applySchema(client: PoolClient): Promise<void> {
  const sql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await client.query("SELECT pg_advisory_xact_lock(4318201)");
  await client.query(sql);
}
