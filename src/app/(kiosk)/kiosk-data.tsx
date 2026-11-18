import { connection } from "next/server";
import type { TodayAttendanceResponse } from "@/lib/contracts/attendance";
import type { KioskSettings } from "@/lib/contracts/settings";
import { KioskScreen } from "@/components/kiosk/kiosk-screen";
import { getTodayAttendance } from "@/server/services/attendance";
import {
  getDefaultKioskSettings,
  getKioskSettings,
} from "@/server/services/settings";

export async function KioskData() {
  await connection();

  let settings: KioskSettings;
  let initialLog: TodayAttendanceResponse | null = null;
  try {
    [settings, initialLog] = await Promise.all([
      getKioskSettings(),
      getTodayAttendance(),
    ]);
  } catch (error) {
    console.error("Kiosk initial read failed", error);
    settings = getDefaultKioskSettings();
    initialLog = null;
  }

  return <KioskScreen settings={settings} initialLog={initialLog} />;
}
