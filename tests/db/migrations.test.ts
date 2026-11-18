import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createConnection, type Connection, type RowDataPacket } from "mysql2/promise";
import { runMigrations, type MigrationTarget } from "@/server/db/migrate";
import { checkLegacySchema } from "@/server/db/legacy-check";

const base = {
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER!,
  password: process.env.DB_PASS!,
};
const fixture = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/legacy-schema.sql"), "utf8");
const dbs = ["qr_attendance_test_fresh", "qr_attendance_test_legacy", "qr_attendance_test_pre"];

async function admin(): Promise<Connection> {
  return createConnection({ ...base, multipleStatements: true });
}

async function freshDb(name: string, schemaSql?: string) {
  const c = await admin();
  try {
    await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await c.query(`CREATE DATABASE \`${name}\``);
    if (schemaSql) {
      await c.query(`USE \`${name}\``);
      await c.query(schemaSql);
    }
  } finally {
    await c.end();
  }
  return { ...base, database: name } satisfies MigrationTarget;
}

async function query<T extends RowDataPacket>(db: string, sql: string): Promise<T[]> {
  const c = await createConnection({ ...base, database: db });
  try {
    const [rows] = await c.query<T[]>(sql);
    return rows;
  } finally {
    await c.end();
  }
}

async function showCreate(db: string): Promise<string[]> {
  const out: string[] = [];
  for (const t of ["users", "attendance", "daily_queue"]) {
    const rows = await query(db, `SHOW CREATE TABLE ${t}`);
    out.push(String(rows[0]["Create Table"]));
  }
  return out;
}

afterAll(async () => {
  const c = await admin();
  for (const d of dbs) await c.query(`DROP DATABASE IF EXISTS \`${d}\``);
  await c.end();
});

describe("migrations", () => {
  it("fresh database gets all four tables matching the legacy fixture", async () => {
    const target = await freshDb(dbs[0]);
    const c = await createConnection(target);
    expect(await checkLegacySchema(c, target.database)).toEqual([]);
    await c.end();
    expect(await runMigrations(target)).toEqual([]);

    const ref = await freshDb(dbs[2], fixture);
    const cols = (db: string) =>
      query(db, `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty, IS_NULLABLE n FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${db}' AND TABLE_NAME IN ('users','attendance','daily_queue') ORDER BY t, c`);
    expect(await cols(target.database)).toEqual(await cols(ref.database));
    const tables = await query(target.database, "SHOW TABLES");
    expect(tables.map((r) => Object.values(r)[0]).sort()).toEqual(
      ["__drizzle_migrations", "attendance", "daily_queue", "settings", "users"],
    );
  });

  it("is a no-op on an existing legacy database and idempotent", async () => {
    const target = await freshDb(dbs[1], fixture);
    const c = await createConnection(target);
    await c.query("INSERT INTO users (employee_id, first_name, last_name, position) VALUES ('E1','A','B','C')");
    await c.query("INSERT INTO attendance (user_id, employee_id, name, position, queue_number, scanned_at) VALUES (1,'E1','A B','C',1,'2026-01-01 08:00:00')");
    await c.end();
    const before = await showCreate(target.database);

    expect(await runMigrations(target)).toEqual([]);
    expect(await runMigrations(target)).toEqual([]);

    expect(await showCreate(target.database)).toEqual(before);
    expect(await query(target.database, "SELECT * FROM attendance")).toHaveLength(1);
    const fks = await query(
      target.database,
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = '${target.database}' AND TABLE_NAME = 'attendance' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    );
    expect(fks).toHaveLength(1);
    await query(target.database, "SELECT * FROM settings");
  });

  it("preflight reports an un-upgraded or incompatible schema and does not migrate", async () => {
    const noQueue = fixture.replace("  queue_number INT NOT NULL,\n", "");
    let target = await freshDb(dbs[2], noQueue);
    const problems = await runMigrations(target);
    expect(problems.join("\n")).toContain("attendance.queue_number is missing");
    const tables = await query(target.database, "SHOW TABLES");
    expect(tables).toHaveLength(3);

    const withDept = fixture.replace("  scanned_at DATETIME NOT NULL,", "  department VARCHAR(100) NOT NULL,\n  scanned_at DATETIME NOT NULL,");
    target = await freshDb(dbs[2], withDept);
    expect((await runMigrations(target)).join("\n")).toContain("attendance.department");
  });
});
