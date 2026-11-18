import {
  scanResponseSchema,
  type ScanDuplicate,
  type ScanFailed,
  type ScanSuccess,
} from "@/lib/contracts/scan";
import {
  todayAttendanceResponseSchema,
  type TodayAttendanceResponse,
} from "@/lib/contracts/attendance";

export const SCAN_TIMEOUT_MS = 10_000;
const LOG_TIMEOUT_MS = 8_000;

export type ScanResult =
  | ScanSuccess
  | ScanDuplicate
  | ScanFailed
  | { status: "error"; message?: string }
  | { status: "unreachable" };

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function postScan(code: string): Promise<ScanResult> {
  const response = await fetchWithTimeout(
    "/api/scan",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    },
    SCAN_TIMEOUT_MS,
  );
  if (!response) return { status: "unreachable" };
  try {
    const parsed = scanResponseSchema.safeParse(
      JSON.parse(await response.text()),
    );
    if (parsed.success) return parsed.data;
  } catch {
    // fall through: not JSON
  }
  return { status: "error" };
}

export type LogResult =
  | { kind: "ok"; data: TodayAttendanceResponse; serverTime: number | null }
  | { kind: "error" }
  | { kind: "unreachable" };

export async function getTodayLog(): Promise<LogResult> {
  const response = await fetchWithTimeout(
    "/api/attendance/today",
    { cache: "no-store" },
    LOG_TIMEOUT_MS,
  );
  if (!response) return { kind: "unreachable" };
  if (!response.ok) return { kind: "error" };
  try {
    const parsed = todayAttendanceResponseSchema.safeParse(
      JSON.parse(await response.text()),
    );
    if (!parsed.success) return { kind: "error" };
    const header = response.headers.get("Date");
    const serverTime = header ? Date.parse(header) : NaN;
    return {
      kind: "ok",
      data: parsed.data,
      serverTime: Number.isNaN(serverTime) ? null : serverTime,
    };
  } catch {
    return { kind: "error" };
  }
}
