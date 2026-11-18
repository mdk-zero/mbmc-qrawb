import { describe, expect, it } from "vitest";
import { classifyDbError, toApiErrorCode } from "@/server/db/errors";

const err = (code: string) => Object.assign(new Error("x"), { code });
const wrapped = (code: string) => new Error("wrap", { cause: new Error("mid", { cause: err(code) }) });

describe("classifyDbError", () => {
  const cases: [string, ReturnType<typeof classifyDbError>][] = [
    ["ECONNREFUSED", "db_unavailable"],
    ["ETIMEDOUT", "db_unavailable"],
    ["ENOTFOUND", "db_unavailable"],
    ["EHOSTUNREACH", "db_unavailable"],
    ["ECONNRESET", "db_unavailable"],
    ["PROTOCOL_CONNECTION_LOST", "db_unavailable"],
    ["ER_ACCESS_DENIED_ERROR", "db_unavailable"],
    ["ER_BAD_DB_ERROR", "db_unavailable"],
    ["ER_CON_COUNT_ERROR", "db_unavailable"],
    ["ER_DBACCESS_DENIED_ERROR", "db_unavailable"],
    ["ER_LOCK_WAIT_TIMEOUT", "busy"],
    ["ER_LOCK_DEADLOCK", "deadlock"],
    ["ER_NO_SUCH_TABLE", "missing_table"],
    ["ER_SOMETHING_ELSE", "other"],
  ];
  it.each(cases)("%s -> %s, directly and nested twice", (code, kind) => {
    expect(classifyDbError(err(code))).toBe(kind);
    expect(classifyDbError(wrapped(code))).toBe(kind);
  });
  it("handles non-errors", () => {
    expect(classifyDbError(undefined)).toBe("other");
    expect(classifyDbError("boom")).toBe("other");
  });
  it("maps to API codes", () => {
    expect(toApiErrorCode("db_unavailable")).toBe("db_unavailable");
    expect(toApiErrorCode("busy")).toBe("busy");
    expect(toApiErrorCode("deadlock")).toBe("busy");
    expect(toApiErrorCode("missing_table")).toBe("server_error");
    expect(toApiErrorCode("other")).toBe("server_error");
  });
});
