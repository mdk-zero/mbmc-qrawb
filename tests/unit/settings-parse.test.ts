import { describe, expect, it } from "vitest";
import { SETTINGS_DEFAULTS } from "@/lib/contracts/settings";
import { mergeSettings } from "@/server/services/settings";

const row = (settingKey: string, value: string) => ({ settingKey, value });

describe("mergeSettings", () => {
  it("returns defaults with no rows", () => {
    expect(mergeSettings([])).toEqual(SETTINGS_DEFAULTS);
  });
  it("falls back per key on bad values", () => {
    const s = mergeSettings([
      row("cooldown_minutes", "0"),
      row("camera_enabled", "not json"),
      row("org_name", "5"),
      row("ticket_show_logo", "true"),
    ]);
    expect(s).toEqual({ ...SETTINGS_DEFAULTS, ticket_show_logo: true });
    expect(mergeSettings([row("cooldown_minutes", "1441")]).cooldown_minutes).toBe(180);
  });
  it("applies valid rows and ignores unknown keys", () => {
    const s = mergeSettings([
      row("cooldown_minutes", "10"),
      row("org_name", '"MBMC"'),
      row("mystery", "1"),
    ]);
    expect(s.cooldown_minutes).toBe(10);
    expect(s.org_name).toBe("MBMC");
    expect(s).not.toHaveProperty("mystery");
  });
});
