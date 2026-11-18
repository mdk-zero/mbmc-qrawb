import { z } from "zod";

// Shared pieces for every API contract. Client-safe: no server-only imports.

/**
 * Wall-clock date in the server's APP_TIMEZONE (default Asia/Manila), "YYYY-MM-DD".
 * Never UTC, never the browser's zone.
 */
export const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Wall-clock date and time in the server's APP_TIMEZONE, "YYYY-MM-DD HH:MM:SS",
 * 24-hour, no offset, no "T". Same format the old app returned and stored.
 * Do not pass it to `new Date()`: browsers parse it inconsistently and would
 * apply the browser's zone. Use `parseLocalDateTime` instead.
 */
export const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export const localDateSchema = z
  .string()
  .regex(LOCAL_DATE_PATTERN, "Expected YYYY-MM-DD");
export type LocalDate = z.infer<typeof localDateSchema>;

export const localDateTimeSchema = z
  .string()
  .regex(LOCAL_DATE_TIME_PATTERN, "Expected YYYY-MM-DD HH:MM:SS");
export type LocalDateTime = z.infer<typeof localDateTimeSchema>;

export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Splits a LocalDateTime into numbers for display. No time zone math. */
export function parseLocalDateTime(value: LocalDateTime): LocalDateTimeParts {
  const [date, time] = value.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  return { year, month, day, hour, minute, second };
}

/**
 * Error body for every endpoint. Any non-2xx response that is not a business
 * outcome (scan `failed` / `duplicate`) has exactly this shape.
 */
export const apiErrorCodeSchema = z.enum([
  "invalid_request",
  "db_unavailable",
  "busy",
  "server_error",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  status: z.literal("error"),
  code: apiErrorCodeSchema,
  message: z.string().min(1),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const API_ERROR_HTTP_STATUS = {
  invalid_request: 400,
  server_error: 500,
  db_unavailable: 503,
  busy: 503,
} as const satisfies Record<ApiErrorCode, number>;

export const API_ERROR_MESSAGES = {
  invalid_request: "The request was not valid.",
  db_unavailable: "Cannot reach the attendance database. Please tell the admin.",
  busy: "The system is busy. Please scan again.",
  server_error: "Server error. Please try again or tell the admin.",
} as const satisfies Record<ApiErrorCode, string>;
