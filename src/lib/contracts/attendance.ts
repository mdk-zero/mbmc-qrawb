import { z } from "zod";
import { localDateSchema, localDateTimeSchema } from "./common";

// GET /api/attendance/today. Public, no auth, no query parameters.
// 200 -> todayAttendanceResponseSchema. Non-2xx -> apiErrorSchema from ./common.
// Plan: docs/plans/backend-kiosk-scan.md

/** One row of `attendance`. name and position are snapshots taken at scan time. */
export const attendanceEntrySchema = z.object({
  id: z.int().positive(),
  /** Empty string for legacy rows where the column is NULL. */
  employee_id: z.string(),
  /** Empty string for legacy rows where the column is NULL. */
  name: z.string(),
  position: z.string(),
  queue_number: z.int().nonnegative(),
  scanned_at: localDateTimeSchema,
});
export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;

export const todayAttendanceResponseSchema = z.object({
  /** "Today" as decided by the server in APP_TIMEZONE. */
  date: localDateSchema,
  /** IANA zone name, e.g. "Asia/Manila". */
  timezone: z.string().min(1),
  /** Server wall-clock time when the list was read. */
  generated_at: localDateTimeSchema,
  /** All of today's scans, newest first (scanned_at DESC, id DESC). */
  entries: z.array(attendanceEntrySchema),
});
export type TodayAttendanceResponse = z.infer<
  typeof todayAttendanceResponseSchema
>;
