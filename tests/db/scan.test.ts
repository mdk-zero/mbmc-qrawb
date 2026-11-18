import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/server/db/client";
import { classifyDbError } from "@/server/db/errors";
import { scanEmployee } from "@/server/services/scan";
import { insertAttendance, insertUser, rawQuery, resetData, setSetting } from "../helpers/db";

const at = (local: string) => () => new Date(`${local.replace(" ", "T")}+08:00`);
const NOW = "2026-11-18 09:00:00";

async function count(table: string) {
  return Number((await rawQuery(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
}

beforeEach(resetData);
afterAll(closePool);

describe("scanEmployee", () => {
  it("records the first scan of the day", async () => {
    await insertUser({ employeeId: "EMP-001", firstName: "Juan", lastName: "Dela Cruz", position: "Nurse" });
    const r = await scanEmployee("EMP-001", { now: at(NOW) });
    expect(r).toMatchObject({
      status: "success",
      queue_number: 1,
      queue_date: "2026-11-18",
      scanned_at: NOW,
      employee: { employee_id: "EMP-001", full_name: "Juan Dela Cruz", position: "Nurse" },
    });
    const rows = await rawQuery("SELECT employee_id, name, position, queue_number, scanned_at FROM attendance");
    expect(rows).toEqual([
      expect.objectContaining({ employee_id: "EMP-001", name: "Juan Dela Cruz", position: "Nurse", queue_number: 1, scanned_at: NOW }),
    ]);
    expect((await rawQuery("SELECT last_number FROM daily_queue"))[0].last_number).toBe(1);
  });

  it("trims the snapshot name when last name is empty", async () => {
    await insertUser({ employeeId: "E", firstName: "Solo", lastName: "" });
    await scanEmployee("E", { now: at(NOW) });
    expect((await rawQuery("SELECT name FROM attendance"))[0].name).toBe("Solo");
  });

  it("numbers a second employee 2", async () => {
    await insertUser({ employeeId: "A" });
    await insertUser({ employeeId: "B" });
    await scanEmployee("A", { now: at(NOW) });
    const r = await scanEmployee("B", { now: at(NOW) });
    expect(r).toMatchObject({ status: "success", queue_number: 2 });
  });

  it("fails an unknown code without writing", async () => {
    const r = await scanEmployee("NOPE", { now: at(NOW) });
    expect(r.status).toBe("failed");
    expect(await count("attendance")).toBe(0);
    expect(await count("daily_queue")).toBe(0);
  });

  it("trims whitespace and rejects empty or over-long codes", async () => {
    await insertUser({ employeeId: "EMP-001" });
    expect((await scanEmployee("  EMP-001\r\n", { now: at(NOW) })).status).toBe("success");
    await resetData();
    await insertUser({ employeeId: "EMP-001" });
    expect((await scanEmployee("", { now: at(NOW) })).status).toBe("failed");
    expect((await scanEmployee("x".repeat(51), { now: at(NOW) })).status).toBe("failed");
    expect(await count("daily_queue")).toBe(0);
  });

  it("matching follows the column collation", async () => {
    await insertUser({ employeeId: "EMP-ABC" });
    const n = Number((await rawQuery("SELECT COUNT(*) AS n FROM users WHERE employee_id = 'emp-abc'"))[0].n);
    const r = await scanEmployee("emp-abc", { now: at(NOW) });
    expect(r.status === "success").toBe(n === 1);
    await resetData();
    await insertUser({ employeeId: "EMP-ABC" });
    expect((await scanEmployee("EMP-ABC", { now: at(NOW) })).status).toBe("success");
  });

  it("returns duplicate inside the cooldown", async () => {
    const id = await insertUser({ employeeId: "E1" });
    await insertAttendance({ userId: id, scannedAt: "2026-11-18 07:00:00" });
    const r = await scanEmployee("E1", { now: at(NOW) });
    expect(r).toMatchObject({
      status: "duplicate",
      last_scanned_at: "2026-11-18 07:00:00",
      cooldown_ends_at: "2026-11-18 10:00:00",
      retry_after_minutes: 60,
      message: "Duplicate scan. Already recorded — try again in 60 min.",
    });
    expect(await count("attendance")).toBe(1);
    expect(await count("daily_queue")).toBe(0);
  });

  it("accepts exactly at last + cooldown and rejects one second before", async () => {
    const id = await insertUser({ employeeId: "E1" });
    await insertAttendance({ userId: id, scannedAt: "2026-11-18 06:00:00" });
    expect((await scanEmployee("E1", { now: at("2026-11-18 09:00:00") })).status).toBe("success");
    await resetData();
    const id2 = await insertUser({ employeeId: "E1" });
    await insertAttendance({ userId: id2, scannedAt: "2026-11-18 06:00:00" });
    const r = await scanEmployee("E1", { now: at("2026-11-18 08:59:59") });
    expect(r).toMatchObject({ status: "duplicate", retry_after_minutes: 1 });
  });

  it("blocks across midnight", async () => {
    const id = await insertUser({ employeeId: "E1" });
    await insertAttendance({ userId: id, scannedAt: "2026-11-18 23:00:00" });
    expect((await scanEmployee("E1", { now: at("2026-11-19 00:30:00") })).status).toBe("duplicate");
  });

  it("reads cooldown_minutes from settings and falls back on a bad value", async () => {
    const id = await insertUser({ employeeId: "E1" });
    await insertAttendance({ userId: id, scannedAt: "2026-11-18 08:49:00" });
    await setSetting("cooldown_minutes", "10");
    expect((await scanEmployee("E1", { now: at(NOW) })).status).toBe("success");
    await resetData();
    const id2 = await insertUser({ employeeId: "E1" });
    await insertAttendance({ userId: id2, scannedAt: "2026-11-18 08:49:00" });
    await setSetting("cooldown_minutes", '"abc"');
    expect((await scanEmployee("E1", { now: at(NOW) })).status).toBe("duplicate");
  });

  it("restarts the queue on a new day", async () => {
    await insertUser({ employeeId: "E1" });
    await insertUser({ employeeId: "E2" });
    await scanEmployee("E1", { now: at("2026-11-18 23:59:59") });
    const r = await scanEmployee("E2", { now: at("2026-11-19 00:00:00") });
    expect(r).toMatchObject({ status: "success", queue_number: 1, queue_date: "2026-11-19" });
    const q = await rawQuery("SELECT DATE_FORMAT(queue_date, '%Y-%m-%d') d, last_number FROM daily_queue ORDER BY queue_date");
    expect(q.map((x) => [x.d, x.last_number])).toEqual([["2026-11-18", 1], ["2026-11-19", 1]]);
  });

  it("treats a last scan in the future as a duplicate", async () => {
    const id = await insertUser({ employeeId: "E1" });
    await insertAttendance({ userId: id, scannedAt: "2026-11-18 10:00:00" });
    expect((await scanEmployee("E1", { now: at(NOW) })).status).toBe("duplicate");
  });

  it("gives 25 parallel scans of different employees numbers 1..25", async () => {
    for (let i = 0; i < 25; i++) await insertUser({ employeeId: `P${i}` });
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => scanEmployee(`P${i}`, { now: at(NOW) })),
    );
    expect(results.every((r) => r.status === "success")).toBe(true);
    const nums = results.map((r) => (r.status === "success" ? r.queue_number : 0)).sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(await count("attendance")).toBe(25);
    expect((await rawQuery("SELECT last_number FROM daily_queue"))[0].last_number).toBe(25);
  });

  it("handles parallel first scans of a new day", async () => {
    for (let i = 0; i < 10; i++) await insertUser({ employeeId: `N${i}` });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => scanEmployee(`N${i}`, { now: at("2030-01-01 08:00:00") })),
    );
    const nums = results.map((r) => (r.status === "success" ? r.queue_number : 0)).sort((a, b) => a - b);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("accepts exactly one of 10 parallel scans by the same employee", async () => {
    await insertUser({ employeeId: "SAME" });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => scanEmployee("SAME", { now: at(NOW) })),
    );
    expect(results.filter((r) => r.status === "success")).toHaveLength(1);
    expect(results.filter((r) => r.status === "duplicate")).toHaveLength(9);
    expect(await count("attendance")).toBe(1);
  });

  it("reports a lock wait timeout as busy, then recovers", async () => {
    const id = await insertUser({ employeeId: "LOCK" });
    const holder = await getPool().getConnection();
    await holder.query("START TRANSACTION");
    await holder.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [id]);
    let error: unknown;
    try {
      await scanEmployee("LOCK", { now: at(NOW), lockWaitTimeoutSeconds: 1 });
    } catch (e) {
      error = e;
    }
    expect(classifyDbError(error)).toBe("busy");
    await holder.query("ROLLBACK");
    holder.release();
    expect((await scanEmployee("LOCK", { now: at(NOW) })).status).toBe("success");
  });

  it("leaves no gap in queue numbers when the insert fails", async () => {
    await insertUser({ employeeId: "FAIL" });
    await insertUser({ employeeId: "OK" });
    await rawQuery(
      "CREATE TRIGGER fail_insert BEFORE INSERT ON attendance FOR EACH ROW IF NEW.employee_id = 'FAIL' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced'; END IF",
    );
    try {
      await expect(scanEmployee("FAIL", { now: at(NOW) })).rejects.toThrow();
      expect(await count("daily_queue")).toBe(0);
      const r = await scanEmployee("OK", { now: at(NOW) });
      expect(r).toMatchObject({ status: "success", queue_number: 1 });
    } finally {
      await rawQuery("DROP TRIGGER IF EXISTS fail_insert");
    }
  });
});
