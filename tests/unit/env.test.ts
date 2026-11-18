import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvForTests } from "@/server/env";

const KEYS = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASS", "DB_NAME", "APP_TIMEZONE"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  resetEnvForTests();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvForTests();
});

describe("env", () => {
  it("uses defaults when unset", () => {
    expect(getEnv()).toEqual({
      DB_HOST: "localhost", DB_PORT: 3306, DB_USER: "root",
      DB_PASS: "", DB_NAME: "qr_attendance", APP_TIMEZONE: "Asia/Manila",
    });
  });
  it("treats empty values as defaults, except DB_PASS", () => {
    for (const k of ["DB_HOST", "DB_USER", "DB_NAME", "APP_TIMEZONE", "DB_PORT"]) process.env[k] = "";
    process.env.DB_PASS = "";
    const e = getEnv();
    expect(e.DB_HOST).toBe("localhost");
    expect(e.DB_USER).toBe("root");
    expect(e.DB_NAME).toBe("qr_attendance");
    expect(e.APP_TIMEZONE).toBe("Asia/Manila");
    expect(e.DB_PORT).toBe(3306);
    expect(e.DB_PASS).toBe("");
  });
  it("parses DB_PORT", () => {
    process.env.DB_PORT = "3307";
    expect(getEnv().DB_PORT).toBe(3307);
  });
  it("rejects an invalid timezone with the value in the message", () => {
    process.env.APP_TIMEZONE = "Mars/Olympus";
    expect(() => getEnv()).toThrow('Invalid APP_TIMEZONE "Mars/Olympus"');
  });
});
