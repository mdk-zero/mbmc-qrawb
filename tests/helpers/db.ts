import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/server/db/client";

export async function rawQuery<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

export async function resetData() {
  const pool = getPool();
  await pool.query("DELETE FROM attendance");
  await pool.query("DELETE FROM users");
  await pool.query("DELETE FROM daily_queue");
  try {
    await pool.query("DELETE FROM settings");
  } catch {
    // settings may be dropped by a test
  }
}

export async function insertUser(u: {
  employeeId: string;
  firstName?: string;
  lastName?: string;
  position?: string;
}): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>(
    "INSERT INTO users (employee_id, first_name, last_name, position) VALUES (?, ?, ?, ?)",
    [u.employeeId, u.firstName ?? "First", u.lastName ?? "Last", u.position ?? "Nurse"],
  );
  return res.insertId;
}

export async function insertAttendance(a: {
  userId: number;
  employeeId?: string;
  name?: string;
  position?: string;
  queueNumber?: number;
  scannedAt: string;
}): Promise<number> {
  const [res] = await getPool().query<ResultSetHeader>(
    "INSERT INTO attendance (user_id, employee_id, name, position, queue_number, scanned_at) VALUES (?, ?, ?, ?, ?, ?)",
    [a.userId, a.employeeId ?? "X", a.name ?? "X", a.position ?? "Nurse", a.queueNumber ?? 1, a.scannedAt],
  );
  return res.insertId;
}

export async function setSetting(key: string, jsonValue: string) {
  await getPool().query(
    "INSERT INTO settings (setting_key, value, updated_at) VALUES (?, ?, '2026-01-01 00:00:00') ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [key, jsonValue],
  );
}
