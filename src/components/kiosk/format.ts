import {
  parseLocalDateTime,
  type LocalDate,
  type LocalDateTime,
} from "@/lib/contracts/common";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clock12(hour: number, minute: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "8:05 AM" from a stored local DATETIME. No time zone math. */
export function formatScanTime(value: LocalDateTime): string {
  const { hour, minute } = parseLocalDateTime(value);
  return clock12(hour, minute);
}

/** "2026-11-18 08:05:12" -> "Nov 18, 2026 8:05 AM" (ticket footer). */
export function formatScanDateTime(value: LocalDateTime): string {
  const { year, month, day, hour, minute } = parseLocalDateTime(value);
  return `${MONTHS_SHORT[month - 1]} ${day}, ${year} ${clock12(hour, minute)}`;
}

/** "Wed, Nov 18, 2026" from a server date. */
export function formatLogDate(value: LocalDate): string {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS_SHORT[weekday]}, ${MONTHS_SHORT[month - 1]} ${day}, ${year}`;
}

export function fullName(first: string, last: string): string {
  const name = `${first} ${last}`.replace(/\s+/g, " ").trim();
  return name || "Employee";
}

export function formatClockParts(now: number, timeZone: string) {
  const time = new Intl.DateTimeFormat("en-PH", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(now);
  const part = (type: string) =>
    time.find((p) => p.type === type)?.value ?? "";
  const date = new Intl.DateTimeFormat("en-PH", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  return {
    hm: `${part("hour")}:${part("minute")}`,
    seconds: part("second"),
    period: part("dayPeriod").toUpperCase().replace(/\./g, ""),
    date,
  };
}
