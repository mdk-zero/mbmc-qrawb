import "server-only";
import type { ApiErrorCode } from "@/lib/contracts/common";

export type DbErrorKind =
  | "db_unavailable"
  | "busy"
  | "deadlock"
  | "missing_table"
  | "other";

const UNAVAILABLE = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_CON_COUNT_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
]);

export function classifyDbError(err: unknown): DbErrorKind {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") {
      if (UNAVAILABLE.has(code)) return "db_unavailable";
      if (code === "ER_LOCK_WAIT_TIMEOUT") return "busy";
      if (code === "ER_LOCK_DEADLOCK") return "deadlock";
      if (code === "ER_NO_SUCH_TABLE") return "missing_table";
    }
    current = (current as { cause?: unknown }).cause;
  }
  return "other";
}

export function toApiErrorCode(kind: DbErrorKind): ApiErrorCode {
  switch (kind) {
    case "db_unavailable":
      return "db_unavailable";
    case "busy":
    case "deadlock":
      return "busy";
    default:
      return "server_error";
  }
}
