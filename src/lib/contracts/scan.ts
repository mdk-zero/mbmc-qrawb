import { z } from "zod";
import {
  apiErrorSchema,
  localDateSchema,
  localDateTimeSchema,
} from "./common";

// POST /api/scan. Public, no auth. Used by the USB scanner and the camera alike.
// Plan: docs/plans/backend-kiosk-scan.md

/** `users.employee_id` is VARCHAR(50). Longer codes can never match. */
export const EMPLOYEE_ID_MAX_LENGTH = 50;

/** Upper bound on the raw `code` string. Longer requests get 400 invalid_request. */
export const SCAN_CODE_MAX_LENGTH = 1024;

// ---------- Request ----------

/**
 * Body: `{ "code": "<raw text read from the QR code>" }`.
 * The client should trim, but the server trims again and treats an empty or
 * over-long code as `failed`, not as an invalid request.
 */
export const scanRequestSchema = z.object({
  code: z.string().max(SCAN_CODE_MAX_LENGTH),
});
export type ScanRequest = z.infer<typeof scanRequestSchema>;

// ---------- Response ----------

/** The employee as stored in `users` at scan time. No database id, no photo. */
export const scanEmployeeSchema = z.object({
  employee_id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  /** `${first_name} ${last_name}` trimmed: the same text stored in `attendance.name`. Print this on the ticket; it can be empty. */
  full_name: z.string(),
  position: z.string(),
});
export type ScanEmployee = z.infer<typeof scanEmployeeSchema>;

export const SCAN_SUCCESS_MESSAGE = "Attendance recorded.";
export const SCAN_FAILED_MESSAGE =
  "QR code not recognized. Ask your admin to register you.";

/** Same text as the old app, including the em dash. */
export function formatDuplicateMessage(retryAfterMinutes: number): string {
  return `Duplicate scan. Already recorded — try again in ${retryAfterMinutes} min.`;
}

/** HTTP 200. Attendance recorded; print the ticket. */
export const scanSuccessSchema = z.object({
  status: z.literal("success"),
  message: z.string(),
  employee: scanEmployeeSchema,
  /** Today's number, starting at 1 each day. */
  queue_number: z.int().positive(),
  /** The day this queue number belongs to (APP_TIMEZONE). */
  queue_date: localDateSchema,
  /** Exactly the value stored in `attendance.scanned_at`. */
  scanned_at: localDateTimeSchema,
});
export type ScanSuccess = z.infer<typeof scanSuccessSchema>;

/** HTTP 429. Inside the cooldown; nothing was written, no number, no ticket. */
export const scanDuplicateSchema = z.object({
  status: z.literal("duplicate"),
  message: z.string(),
  employee: scanEmployeeSchema,
  /** The employee's most recent recorded scan, of any date. */
  last_scanned_at: localDateTimeSchema,
  /** last_scanned_at + cooldown. A scan at or after this time is accepted. */
  cooldown_ends_at: localDateTimeSchema,
  /** Whole minutes until cooldown_ends_at, rounded up, at least 1. */
  retry_after_minutes: z.int().positive(),
});
export type ScanDuplicate = z.infer<typeof scanDuplicateSchema>;

/** HTTP 404. Unknown, empty or over-long code. */
export const scanFailedSchema = z.object({
  status: z.literal("failed"),
  message: z.string(),
});
export type ScanFailed = z.infer<typeof scanFailedSchema>;

/**
 * Every response body from POST /api/scan, including errors
 * (400 invalid_request, 500 server_error, 503 db_unavailable / busy).
 * Branch on `status`, not on the HTTP code.
 */
export const scanResponseSchema = z.discriminatedUnion("status", [
  scanSuccessSchema,
  scanDuplicateSchema,
  scanFailedSchema,
  apiErrorSchema,
]);
export type ScanResponse = z.infer<typeof scanResponseSchema>;
export type ScanStatus = ScanResponse["status"];

/** What the scan service returns; errors are thrown and mapped by the handler. */
export type ScanOutcome = ScanSuccess | ScanDuplicate | ScanFailed;

export const SCAN_OUTCOME_HTTP_STATUS = {
  success: 200,
  duplicate: 429,
  failed: 404,
} as const satisfies Record<ScanOutcome["status"], number>;
