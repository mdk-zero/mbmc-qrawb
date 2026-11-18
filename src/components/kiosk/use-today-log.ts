"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TodayAttendanceResponse } from "@/lib/contracts/attendance";
import type { Connection } from "./use-scan-controller";
import { getTodayLog } from "./scan-api";

const POLL_MS = 20_000;
const POLL_OFFLINE_MS = 5_000;
const OFFSET_THRESHOLD_MS = 2000;

type Options = {
  initialLog: TodayAttendanceResponse | null;
  connection: Connection;
  setConnection: (connection: Connection) => void;
  onServerOffset: (offsetMs: number) => void;
};

export function useTodayLog({
  initialLog,
  connection,
  setConnection,
  onServerOffset,
}: Options) {
  const router = useRouter();
  const [log, setLog] = useState<TodayAttendanceResponse | null>(initialLog);
  const [failed, setFailed] = useState(false);

  const dateRef = useRef<string | null>(initialLog?.date ?? null);
  const inflight = useRef(false);
  const pending = useRef(false);
  const lastFetchAt = useRef(0);
  const connectionRef = useRef(connection);
  const hasLog = useRef(initialLog !== null);
  const callbacks = useRef({ setConnection, onServerOffset, router });
  useEffect(() => {
    connectionRef.current = connection;
    callbacks.current = { setConnection, onServerOffset, router };
  });

  const refresh = useCallback(async function refresh(): Promise<void> {
    if (inflight.current) {
      pending.current = true;
      return;
    }
    inflight.current = true;
    lastFetchAt.current = Date.now();
    const received = Date.now();
    try {
      const result = await getTodayLog();
      const cb = callbacks.current;
      if (result.kind === "unreachable") {
        cb.setConnection("unreachable");
        setFailed(true);
        return;
      }
      cb.setConnection("ok");
      if (result.kind === "error") {
        setFailed(true);
        return;
      }
      setFailed(false);
      hasLog.current = true;
      setLog(result.data);
      if (result.serverTime !== null) {
        const diff = result.serverTime - received;
        cb.onServerOffset(Math.abs(diff) > OFFSET_THRESHOLD_MS ? diff : 0);
      }
      if (dateRef.current !== result.data.date) {
        dateRef.current = result.data.date;
        cb.router.refresh();
      }
    } finally {
      inflight.current = false;
      if (pending.current) {
        pending.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    lastFetchAt.current = Date.now();
    if (!hasLog.current) void refresh();
    const timer = setInterval(() => {
      if (document.hidden) return;
      const interval =
        connectionRef.current === "unreachable" || !hasLog.current
          ? POLL_OFFLINE_MS
          : POLL_MS;
      if (Date.now() - lastFetchAt.current >= interval) void refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  const refreshNow = useCallback(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({ log, failed, refreshNow }),
    [log, failed, refreshNow],
  );
}
