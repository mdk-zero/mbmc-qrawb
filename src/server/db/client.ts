import "server-only";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { getEnv } from "../env";
import * as schema from "./schema";

type Holder = { pool?: Pool; db?: MySql2Database<typeof schema> };
const holder = globalThis as typeof globalThis & { __mbmcDb?: Holder };

function state(): Holder {
  return (holder.__mbmcDb ??= {});
}

export function getPool(): Pool {
  const s = state();
  if (!s.pool) {
    const env = getEnv();
    s.pool = createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASS,
      database: env.DB_NAME,
      dateStrings: true,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 2000,
    });
  }
  return s.pool;
}

export function getDb(): MySql2Database<typeof schema> {
  const s = state();
  if (!s.db) {
    s.db = drizzle(getPool(), { schema, mode: "default" });
  }
  return s.db;
}

export async function closePool(): Promise<void> {
  const s = state();
  const pool = s.pool;
  s.pool = undefined;
  s.db = undefined;
  if (pool) await pool.end();
}
