import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { todayAttendanceResponseSchema } from "@/lib/contracts/attendance";
import { closePool } from "@/server/db/client";
import { getTodayAttendance } from "@/server/services/attendance";
import { insertAttendance, insertUser, rawQuery, resetData } from "../helpers/db";

beforeEach(resetData);
afterAll(closePool);

const NOON = () => new Date("2026-11-18T04:00:00Z");

describe("getTodayAttendance", () => {
  it("returns only today's rows, newest first, ties by id desc", async () => {
    const u = await insertUser({ employeeId: "E1" });
    await insertAttendance({ userId: u, scannedAt: "2026-11-17 23:59:59", queueNumber: 9 });
    const a = await insertAttendance({ userId: u, scannedAt: "2026-11-18 00:00:00", queueNumber: 1 });
    const b = await insertAttendance({ userId: u, scannedAt: "2026-11-18 12:00:00", queueNumber: 2 });
    const c = await insertAttendance({ userId: u, scannedAt: "2026-11-18 12:00:00", queueNumber: 3 });
    await insertAttendance({ userId: u, scannedAt: "2026-11-19 00:00:00", queueNumber: 9 });
    const r = await getTodayAttendance({ now: NOON });
    expect(r.entries.map((e) => e.id)).toEqual([c, b, a]);
    expect(todayAttendanceResponseSchema.safeParse(r).success).toBe(true);
  });

  it("decides the date in Asia/Manila", async () => {
    const r = await getTodayAttendance({ now: () => new Date("2026-11-18T16:30:00Z") });
    expect(r).toMatchObject({ date: "2026-11-19", timezone: "Asia/Manila", generated_at: "2026-11-19 00:30:00" });
  });

  it("turns NULL employee_id and name into empty strings", async () => {
    const u = await insertUser({ employeeId: "E1" });
    await rawQuery("ALTER TABLE attendance MODIFY employee_id VARCHAR(50) NULL, MODIFY name VARCHAR(241) NULL");
    await rawQuery(
      "INSERT INTO attendance (user_id, employee_id, name, position, queue_number, scanned_at) VALUES (?, NULL, NULL, 'RN', 1, '2026-11-18 08:00:00')",
      [u],
    );
    const r = await getTodayAttendance({ now: NOON });
    expect(r.entries[0]).toMatchObject({ employee_id: "", name: "" });
    expect(todayAttendanceResponseSchema.safeParse(r).success).toBe(true);
    await rawQuery("DELETE FROM attendance");
    await rawQuery("ALTER TABLE attendance MODIFY employee_id VARCHAR(50) NOT NULL, MODIFY name VARCHAR(241) NOT NULL");
  });
});
