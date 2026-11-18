import { z } from "zod";

// App settings stored one row per key in the `settings` table.
// The kiosk page (a Server Component) gets KioskSettings by calling
// getKioskSettings() from "@/server/services/settings" directly; there is no
// settings endpoint yet. The admin settings plan adds GET/PUT /api/settings
// on top of these schemas.
// Plan: docs/plans/backend-kiosk-scan.md

/** One field per row in `settings` (column `setting_key`). */
export const settingsSchema = z.object({
  /** Minutes after an accepted scan during which the same employee gets `duplicate`. */
  cooldown_minutes: z.int().min(1).max(1440),
  /** Show the camera scanner on the kiosk. The USB scanner always works. */
  camera_enabled: z.boolean(),
  /** Shown on the kiosk screen, and on the ticket when ticket_show_org_name is on. */
  org_name: z.string().trim().min(1).max(120),
  /** Print /logo.png at the top of the ticket. */
  ticket_show_logo: z.boolean(),
  /** Print org_name at the top of the ticket. */
  ticket_show_org_name: z.boolean(),
  /** Print the scan date and time at the bottom of the ticket. */
  ticket_show_scan_time: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const SETTING_KEYS = Object.keys(
  settingsSchema.shape,
) as readonly SettingKey[];

/**
 * Used when a row is missing or its stored value fails validation.
 * Ticket options all off reproduces the old ticket: number and name only.
 */
export const SETTINGS_DEFAULTS: Settings = {
  cooldown_minutes: 180,
  camera_enabled: false,
  org_name: "Metro Balayan Medical Center",
  ticket_show_logo: false,
  ticket_show_org_name: false,
  ticket_show_scan_time: false,
};

export const ticketOptionsSchema = z.object({
  show_logo: z.boolean(),
  show_org_name: z.boolean(),
  show_scan_time: z.boolean(),
});
export type TicketOptions = z.infer<typeof ticketOptionsSchema>;

/** What the kiosk page at `/` needs. Read once per page load. */
export const kioskSettingsSchema = z.object({
  org_name: z.string().min(1),
  camera_enabled: z.boolean(),
  ticket: ticketOptionsSchema,
  /** APP_TIMEZONE (IANA name), for the on-screen clock's Intl.DateTimeFormat timeZone. */
  timezone: z.string().min(1),
});
export type KioskSettings = z.infer<typeof kioskSettingsSchema>;

/** Maps stored settings to the kiosk shape. Pure; used by the server and safe on the client. */
export function toKioskSettings(
  settings: Settings,
  timezone: string,
): KioskSettings {
  return {
    org_name: settings.org_name,
    camera_enabled: settings.camera_enabled,
    ticket: {
      show_logo: settings.ticket_show_logo,
      show_org_name: settings.ticket_show_org_name,
      show_scan_time: settings.ticket_show_scan_time,
    },
    timezone,
  };
}
