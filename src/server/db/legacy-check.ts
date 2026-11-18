import "server-only";
import type { Connection, Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

type Queryable = Pick<Pool | PoolConnection | Connection, "query">;

const REQUIRED: Record<string, string[]> = {
  users: ["id", "employee_id", "first_name", "last_name", "position", "photo_filename", "email", "created_at"],
  attendance: ["id", "user_id", "employee_id", "name", "position", "queue_number", "scanned_at"],
  daily_queue: ["queue_date", "last_number"],
};

const MUST_BE_NOT_NULL: Record<string, string[]> = {
  attendance: ["queue_number", "position"],
  users: ["first_name", "last_name", "position"],
};

export async function checkLegacySchema(
  conn: Queryable,
  dbName: string,
): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, IS_NULLABLE AS n, COLUMN_DEFAULT AS d, EXTRA AS x
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('users', 'attendance', 'daily_queue')`,
    [dbName],
  );
  const byTable = new Map<string, RowDataPacket[]>();
  for (const r of rows) {
    const key = String(r.t).toLowerCase();
    byTable.set(key, [...(byTable.get(key) ?? []), r]);
  }

  const problems: string[] = [];
  for (const [table, required] of Object.entries(REQUIRED)) {
    const cols = byTable.get(table);
    if (!cols) continue;
    const names = new Map(cols.map((c) => [String(c.c).toLowerCase(), c]));
    for (const col of required) {
      if (!names.has(col)) problems.push(`${table}.${col} is missing`);
    }
    for (const col of MUST_BE_NOT_NULL[table] ?? []) {
      if (names.get(col)?.n === "YES") problems.push(`${table}.${col} must be NOT NULL`);
    }
    if (table === "daily_queue") continue;
    for (const c of cols) {
      const name = String(c.c).toLowerCase();
      if (required.includes(name)) continue;
      const autoInc = String(c.x ?? "").toLowerCase().includes("auto_increment");
      if (c.n === "NO" && c.d === null && !autoInc) {
        problems.push(`${table}.${c.c} is NOT NULL with no default, so inserts would fail`);
      }
    }
  }
  return problems;
}
