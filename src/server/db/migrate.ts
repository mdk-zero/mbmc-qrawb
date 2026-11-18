import "server-only";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createPool } from "mysql2/promise";
import { checkLegacySchema } from "./legacy-check";

export type MigrationTarget = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

/** Runs the preflight check, then the migrations. Returns the preflight problems; migrates only when there are none. */
export async function runMigrations(
  target: MigrationTarget,
  migrationsFolder = path.join(process.cwd(), "drizzle"),
): Promise<string[]> {
  const conn = createPool({ ...target, dateStrings: true, connectTimeout: 2000, connectionLimit: 1 });
  try {
    const problems = await checkLegacySchema(conn, target.database);
    if (problems.length > 0) return problems;
    await migrate(drizzle(conn, { mode: "default" }), { migrationsFolder });
    return [];
  } finally {
    await conn.end();
  }
}
