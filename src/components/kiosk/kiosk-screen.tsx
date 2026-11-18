"use client";

import { useCallback, useRef, useState } from "react";
import type { TodayAttendanceResponse } from "@/lib/contracts/attendance";
import type { KioskSettings } from "@/lib/contracts/settings";
import { KioskFooter } from "./kiosk-footer";
import { KioskHeader } from "./kiosk-header";
import { OfflineBanner } from "./offline-banner";
import { ScanStage } from "./scan-stage";
import { TodayLog } from "./today-log";
import { useHideIdleCursor } from "./use-hide-idle-cursor";
import { useScanController, type Connection } from "./use-scan-controller";
import { useScannerInput } from "./use-scanner-input";
import { useTodayLog } from "./use-today-log";

export function KioskScreen({
  settings,
  initialLog,
}: {
  settings: KioskSettings;
  initialLog: TodayAttendanceResponse | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [connection, setConnection] = useState<Connection>("ok");
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const todayLog = useTodayLog({
    initialLog,
    connection,
    setConnection,
    onServerOffset: setServerOffsetMs,
  });

  const { state, scan } = useScanController({
    orgName: settings.org_name,
    ticket: settings.ticket,
    refreshLog: todayLog.refreshNow,
    setConnection,
  });

  const onScan = useCallback((code: string) => scan(code), [scan]);
  useScannerInput(onScan);
  useHideIdleCursor(rootRef);

  return (
    <div
      ref={rootRef}
      className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-muted/40 select-none"
    >
      <KioskHeader
        orgName={settings.org_name}
        timezone={settings.timezone}
        serverOffsetMs={serverOffsetMs}
      />
      <div>{connection === "unreachable" && <OfflineBanner />}</div>
      <main className="grid min-h-0 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ScanStage
          view={state.view}
          result={state.result}
          busy={state.busy}
          hint={state.hint}
          cameraEnabled={settings.camera_enabled}
          onDetect={onScan}
        />
        <TodayLog
          log={todayLog.log}
          failed={todayLog.failed}
          highlight={state.highlight}
        />
      </main>
      <KioskFooter />
    </div>
  );
}
