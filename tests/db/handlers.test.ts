import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { todayAttendanceResponseSchema } from "@/lib/contracts/attendance";
import { apiErrorSchema } from "@/lib/contracts/common";
import { SETTINGS_DEFAULTS, kioskSettingsSchema, toKioskSettings } from "@/lib/contracts/settings";
import { scanResponseSchema } from "@/lib/contracts/scan";
import { closePool } from "@/server/db/client";
import { classifyDbError } from "@/server/db/errors";
import { resetEnvForTests } from "@/server/env";
import { handleTodayAttendanceRequest } from "@/server/http/attendance-today-handler";
import { handleScanRequest } from "@/server/http/scan-handler";
import { getTodayAttendance } from "@/server/services/attendance";
import { getDefaultKioskSettings, getKioskSettings } from "@/server/services/settings";
import { insertAttendance, insertUser, rawQuery, resetData, setSetting } from "../helpers/db";

const post = (body: string) =>
  handleScanRequest(new Request("http://x/api/scan", { method: "POST", body }));
const scan = (code: unknown) => post(JSON.stringify({ code }));

async function check(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  const body = await res.json();
  expect(scanResponseSchema.safeParse(body).success).toBe(true);
  return body;
}

async function withDbDown<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.DB_PORT;
  await closePool();
  process.env.DB_PORT = "1";
  resetEnvForTests();
  try {
    return await fn();
  } finally {
    process.env.DB_PORT = saved;
    resetEnvForTests();
    await closePool();
  }
}

beforeEach(resetData);
afterAll(closePool);

describe("scan handler", () => {
  it("maps success, duplicate and unknown to 200, 429, 404", async () => {
    await insertUser({ employeeId: "EMP-001" });
    expect((await check(await scan("EMP-001"), 200)).status).toBe("success");
    expect((await check(await scan("EMP-001"), 429)).status).toBe("duplicate");
    expect((await check(await scan("NOPE"), 404)).status).toBe("failed");
    expect((await check(await scan("   "), 404)).status).toBe("failed");
    expect((await check(await scan("x".repeat(60)), 404)).status).toBe("failed");
  });

  it("rejects malformed requests with 400 invalid_request", async () => {
    for (const body of [
      "not json",
      "{}",
      '{"code": 123}',
      "[]",
      "null",
      JSON.stringify({ code: "x", pad: "y".repeat(5000) }),
      JSON.stringify({ code: "x".repeat(1025) }),
    ]) {
      const b = await check(await post(body), 400);
      expect(b).toMatchObject({ status: "error", code: "invalid_request" });
    }
  });

  it("returns 503 db_unavailable when the database is down", async () => {
    await withDbDown(async () => {
      const b = await check(await scan("EMP-001"), 503);
      expect(b.code).toBe("db_unavailable");
      const t = await handleTodayAttendanceRequest();
      expect(t.status).toBe(503);
      expect(apiErrorSchema.parse(await t.json()).code).toBe("db_unavailable");
    });
  });

  it("still scans when the settings table is missing", async () => {
    await rawQuery("DROP TABLE settings");
    try {
      await insertUser({ employeeId: "EMP-001" });
      await check(await scan("EMP-001"), 200);
      expect(await getKioskSettings()).toEqual(toKioskSettings(SETTINGS_DEFAULTS, "Asia/Manila"));
    } finally {
      await rawQuery(
        "CREATE TABLE IF NOT EXISTS settings (setting_key VARCHAR(64) NOT NULL PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME NOT NULL)",
      );
    }
  });
});

describe("today handler", () => {
  it("returns the log with no-store", async () => {
    const u = await insertUser({ employeeId: "E1" });
    const { date } = await getTodayAttendance();
    await insertAttendance({ userId: u, scannedAt: `${date} 00:00:01` });
    const res = await handleTodayAttendanceRequest();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = todayAttendanceResponseSchema.parse(await res.json());
    expect(body.entries).toHaveLength(1);
  });
});

describe("kiosk services", () => {
  it("reject when the database is down; defaults still work", async () => {
    await withDbDown(async () => {
      const s = await getKioskSettings().then(() => null, (e) => e);
      expect(classifyDbError(s)).toBe("db_unavailable");
      const t = await getTodayAttendance().then(() => null, (e) => e);
      expect(classifyDbError(t)).toBe("db_unavailable");
      expect(getDefaultKioskSettings().timezone).toBe("Asia/Manila");
      expect(kioskSettingsSchema.safeParse(getDefaultKioskSettings()).success).toBe(true);
    });
  });

  it("reads stored settings", async () => {
    await setSetting("ticket_show_logo", "true");
    await setSetting("org_name", '"MBMC"');
    const s = await getKioskSettings();
    expect(s.ticket.show_logo).toBe(true);
    expect(s.org_name).toBe("MBMC");
    expect(kioskSettingsSchema.safeParse(s).success).toBe(true);
  });
});
