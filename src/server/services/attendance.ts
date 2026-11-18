import "server-only";
import { and, desc, gte, lt } from "drizzle-orm";
import type { TodayAttendanceResponse } from "@/lib/contracts/attendance";
import { getDb } from "../db/client";
import { attendance } from "../db/schema";
import { getEnv } from "../env";
import { addDays, localDateOf, nowLocal } from "../time";

export async function getTodayAttendance(
  options: { now?: () => Date } = {},
): Promise<TodayAttendanceResponse> {
  const now = nowLocal(options.now?.() ?? new Date());
  const date = localDateOf(now);
  const next = addDays(date, 1);

  const rows = await getDb()
    .select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      name: attendance.name,
      position: attendance.position,
      queueNumber: attendance.queueNumber,
      scannedAt: attendance.scannedAt,
    })
    .from(attendance)
    .where(
      and(
        gte(attendance.scannedAt, `${date} 00:00:00`),
        lt(attendance.scannedAt, `${next} 00:00:00`),
      ),
    )
    .orderBy(desc(attendance.scannedAt), desc(attendance.id));

  return {
    date,
    timezone: getEnv().APP_TIMEZONE,
    generated_at: now,
    entries: rows.map((r) => ({
      id: r.id,
      employee_id: r.employeeId ?? "",
      name: r.name ?? "",
      position: r.position,
      queue_number: r.queueNumber,
      scanned_at: r.scannedAt,
    })),
  };
}
