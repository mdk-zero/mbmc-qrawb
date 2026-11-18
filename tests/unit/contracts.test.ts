import { describe, expect, it } from "vitest";
import { formatDuplicateMessage, scanResponseSchema } from "@/lib/contracts/scan";

const employee = { employee_id: "E1", first_name: "A", last_name: "B", full_name: "A B", position: "RN" };

describe("scanResponseSchema", () => {
  it("accepts the four shapes", () => {
    const bodies = [
      { status: "success", message: "m", employee, queue_number: 1, queue_date: "2026-11-18", scanned_at: "2026-11-18 08:00:00" },
      { status: "duplicate", message: "m", employee, last_scanned_at: "2026-11-18 08:00:00", cooldown_ends_at: "2026-11-18 11:00:00", retry_after_minutes: 5 },
      { status: "failed", message: "m" },
      { status: "error", code: "busy", message: "m" },
    ];
    for (const b of bodies) expect(scanResponseSchema.safeParse(b).success).toBe(true);
  });
  it("rejects unknown status and incomplete success", () => {
    expect(scanResponseSchema.safeParse({ status: "weird", message: "m" }).success).toBe(false);
    expect(scanResponseSchema.safeParse({ status: "success", message: "m", employee, queue_date: "2026-11-18", scanned_at: "2026-11-18 08:00:00" }).success).toBe(false);
  });
  it("formats the duplicate message with an em dash", () => {
    expect(formatDuplicateMessage(3)).toBe("Duplicate scan. Already recorded — try again in 3 min.");
  });
});
