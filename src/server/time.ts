import "server-only";
import type { LocalDate, LocalDateTime } from "@/lib/contracts/common";
import { getEnv } from "./env";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function toLocalDateTime(instant: Date, timeZone: string): LocalDateTime {
  const parts: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function localDateOf(dt: LocalDateTime): LocalDate {
  return dt.slice(0, 10);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatUtcParts(d: Date): LocalDateTime {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  return formatUtcParts(new Date(Date.UTC(y, m - 1, d + days))).slice(0, 10);
}

export function wallClockSeconds(dt: LocalDateTime): number {
  const [date, time] = dt.split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi, s] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi, s) / 1000;
}

export function addSecondsLocal(dt: LocalDateTime, seconds: number): LocalDateTime {
  return formatUtcParts(new Date((wallClockSeconds(dt) + seconds) * 1000));
}

export function nowLocal(instant: Date = new Date()): LocalDateTime {
  return toLocalDateTime(instant, getEnv().APP_TIMEZONE);
}
