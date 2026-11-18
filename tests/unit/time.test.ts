import { describe, expect, it } from "vitest";
import {
  addDays,
  addSecondsLocal,
  toLocalDateTime,
  wallClockSeconds,
} from "@/server/time";

describe("time", () => {
  it("converts to Manila", () => {
    expect(toLocalDateTime(new Date("2026-11-18T16:00:00Z"), "Asia/Manila")).toBe("2026-11-19 00:00:00");
    expect(toLocalDateTime(new Date("2026-11-18T15:59:59Z"), "Asia/Manila")).toBe("2026-11-18 23:59:59");
  });
  it("never renders hour 24", () => {
    expect(toLocalDateTime(new Date("2026-11-18T16:00:00Z"), "Asia/Manila")).toContain(" 00:");
  });
  it("UTC differs by 8 hours", () => {
    const d = new Date("2026-11-18T05:00:00Z");
    expect(toLocalDateTime(d, "UTC")).toBe("2026-11-18 05:00:00");
    expect(toLocalDateTime(d, "Asia/Manila")).toBe("2026-11-18 13:00:00");
  });
  it("addDays crosses month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("wallClockSeconds and addSecondsLocal round-trip", () => {
    const dt = "2026-11-18 23:59:59";
    expect(addSecondsLocal(dt, 0)).toBe(dt);
    expect(addSecondsLocal(dt, 1)).toBe("2026-11-19 00:00:00");
    expect(wallClockSeconds("2026-11-19 00:00:00") - wallClockSeconds(dt)).toBe(1);
  });
});
