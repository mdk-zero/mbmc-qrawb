import "server-only";
import { inArray } from "drizzle-orm";
import {
  SETTING_KEYS,
  SETTINGS_DEFAULTS,
  settingsSchema,
  toKioskSettings,
  type KioskSettings,
  type Settings,
} from "@/lib/contracts/settings";
import { getDb } from "../db/client";
import { classifyDbError } from "../db/errors";
import { settings as settingsTable } from "../db/schema";
import { getEnv } from "../env";

const warned = new Set<string>();

function warnOnce(key: string, detail: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[settings] ${key}: ${detail}; using default`);
}

export function mergeSettings(
  rows: { settingKey: string; value: string }[],
): Settings {
  const merged: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (!(SETTING_KEYS as readonly string[]).includes(row.settingKey)) continue;
    const key = row.settingKey as keyof Settings;
    try {
      const parsed = settingsSchema.shape[key].safeParse(JSON.parse(row.value));
      if (parsed.success) merged[key] = parsed.data;
      else warnOnce(key, "invalid stored value");
    } catch {
      warnOnce(key, "stored value is not JSON");
    }
  }
  return merged as Settings;
}

export async function getSettings(): Promise<Settings> {
  try {
    const rows = await getDb()
      .select({ settingKey: settingsTable.settingKey, value: settingsTable.value })
      .from(settingsTable)
      .where(inArray(settingsTable.settingKey, [...SETTING_KEYS]));
    return mergeSettings(rows);
  } catch (err) {
    if (classifyDbError(err) === "missing_table") {
      warnOnce("settings table", "table is missing");
      return { ...SETTINGS_DEFAULTS };
    }
    throw err;
  }
}

export async function getCooldownMinutes(): Promise<number> {
  return (await getSettings()).cooldown_minutes;
}

export async function getKioskSettings(): Promise<KioskSettings> {
  return toKioskSettings(await getSettings(), getEnv().APP_TIMEZONE);
}

export function getDefaultKioskSettings(): KioskSettings {
  return toKioskSettings(SETTINGS_DEFAULTS, getEnv().APP_TIMEZONE);
}
