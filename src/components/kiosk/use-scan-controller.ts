"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { scanRequestSchema } from "@/lib/contracts/scan";
import type { TicketOptions } from "@/lib/contracts/settings";
import { SCAN_FAILED_MESSAGE } from "@/lib/contracts/scan";
import { fullName, formatScanDateTime, formatScanTime } from "./format";
import { postScan, type ScanResult } from "./scan-api";
import { useTicketPrinter } from "./use-ticket-printer";

export const DWELL_MS = 6000;
export const DWELL_PRINT_FAILED_MS = 10_000;
const LOCK_MS = 2500;
const HINT_MS = 2000;
const SLOW_MS = 300;
const SAME_CODE_MS = 10_000;
const HIGHLIGHT_MS = 3000;
const SERVER_ERROR_FALLBACK =
  "Server error. Please try again, or ask HR for help.";
const UNREACHABLE_MESSAGE =
  "Cannot reach the server. Check your connection and try again.";

export type ResultView =
  | {
      id: number;
      kind: "success";
      queueNumber: number;
      name: string;
      employeeId: string;
      position: string;
      time: string;
      printError: boolean;
      dwellMs: number;
    }
  | {
      id: number;
      kind: "duplicate";
      message: string;
      name: string;
      employeeId: string;
      position: string;
      time: string;
      dwellMs: number;
    }
  | { id: number; kind: "problem"; message: string; dwellMs: number };

export type Connection = "ok" | "unreachable";

export type Highlight = { queueNumber: number; employeeId: string };

type State = {
  view: "idle" | "submitting" | "result";
  result: ResultView | null;
  busy: boolean;
  hint: boolean;
  highlight: Highlight | null;
};

type Action =
  | { type: "RESULT"; result: ResultView; highlight?: Highlight }
  | { type: "SLOW" }
  | { type: "BUSY"; busy: boolean }
  | { type: "HINT"; on: boolean }
  | { type: "DWELL_END" }
  | { type: "PRINT_FAILED"; queueNumber: number; dwellMs: number }
  | { type: "CLEAR_HIGHLIGHT" };

const initialState: State = {
  view: "idle",
  result: null,
  busy: false,
  hint: false,
  highlight: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "RESULT":
      return {
        ...state,
        view: "result",
        result: action.result,
        highlight: action.highlight ?? state.highlight,
      };
    case "SLOW":
      return { ...state, view: "submitting" };
    case "BUSY":
      return { ...state, busy: action.busy };
    case "HINT":
      return { ...state, hint: action.on };
    case "DWELL_END":
      return state.view === "result"
        ? { ...state, view: "idle", result: null }
        : state;
    case "PRINT_FAILED":
      if (
        state.result?.kind === "success" &&
        state.result.queueNumber === action.queueNumber
      ) {
        return {
          ...state,
          result: { ...state.result, printError: true, dwellMs: action.dwellMs },
        };
      }
      return state;
    case "CLEAR_HIGHLIGHT":
      return { ...state, highlight: null };
  }
}

type Options = {
  orgName: string;
  ticket: TicketOptions;
  refreshLog: () => void;
  setConnection: (connection: Connection) => void;
};

export function useScanController({
  orgName,
  ticket,
  refreshLog,
  setConnection,
}: Options) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const inflight = useRef(false);
  const lockedUntil = useRef(0);
  const last = useRef<{ code: string; at: number; ok: boolean } | null>(null);
  const resultRef = useRef<{ id: number; queueNumber: number | null } | null>(
    null,
  );
  const resultSeq = useRef(0);
  const timers = useRef<{
    dwell?: ReturnType<typeof setTimeout>;
    lock?: ReturnType<typeof setTimeout>;
    hint?: ReturnType<typeof setTimeout>;
    slow?: ReturnType<typeof setTimeout>;
    highlight?: ReturnType<typeof setTimeout>;
  }>({});

  const startDwell = useCallback((ms: number) => {
    clearTimeout(timers.current.dwell);
    timers.current.dwell = setTimeout(
      () => dispatch({ type: "DWELL_END" }),
      ms,
    );
  }, []);

  const onPrintFailed = useCallback(
    (queueNumber: number) => {
      if (resultRef.current?.queueNumber !== queueNumber) return;
      dispatch({
        type: "PRINT_FAILED",
        queueNumber,
        dwellMs: DWELL_PRINT_FAILED_MS,
      });
      startDwell(DWELL_PRINT_FAILED_MS);
    },
    [startDwell],
  );

  const printer = useTicketPrinter({ onFailed: onPrintFailed });

  const lockFor = useCallback((ms: number) => {
    lockedUntil.current = Date.now() + ms;
    dispatch({ type: "BUSY", busy: true });
    clearTimeout(timers.current.lock);
    timers.current.lock = setTimeout(() => {
      lockedUntil.current = 0;
      if (!inflight.current) dispatch({ type: "BUSY", busy: false });
    }, ms);
  }, []);

  const showResult = useCallback(
    (build: (id: number) => ResultView, queueNumber: number | null, highlight?: Highlight) => {
      const id = ++resultSeq.current;
      resultRef.current = { id, queueNumber };
      dispatch({ type: "RESULT", result: build(id), highlight });
      startDwell(DWELL_MS);
      if (highlight) {
        clearTimeout(timers.current.highlight);
        timers.current.highlight = setTimeout(
          () => dispatch({ type: "CLEAR_HIGHLIGHT" }),
          HIGHLIGHT_MS,
        );
      }
    },
    [startDwell],
  );

  const showProblem = useCallback(
    (message: string) =>
      showResult(
        (id) => ({ id, kind: "problem", message, dwellMs: DWELL_MS }),
        null,
      ),
    [showResult],
  );

  const handleOutcome = useCallback(
    (outcome: ScanResult, code: string) => {
      inflight.current = false;
      clearTimeout(timers.current.slow);
      lockFor(LOCK_MS);
      last.current = {
        code,
        at: Date.now(),
        ok: outcome.status === "success" || outcome.status === "duplicate",
      };

      switch (outcome.status) {
        case "success": {
          const name = fullName(
            outcome.employee.first_name,
            outcome.employee.last_name,
          );
          const printName = outcome.employee.full_name || name;
          showResult(
            (id) => ({
              id,
              kind: "success",
              queueNumber: outcome.queue_number,
              name,
              employeeId: outcome.employee.employee_id,
              position: outcome.employee.position,
              time: formatScanTime(outcome.scanned_at),
              printError: false,
              dwellMs: DWELL_MS,
            }),
            outcome.queue_number,
            {
              queueNumber: outcome.queue_number,
              employeeId: outcome.employee.employee_id,
            },
          );
          setConnection("ok");
          printer.enqueue({
            queueNumber: outcome.queue_number,
            name: printName || "Employee",
            orgName,
            scanTime: formatScanDateTime(outcome.scanned_at),
            ticket,
          });
          refreshLog();
          break;
        }
        case "duplicate":
          showResult(
            (id) => ({
              id,
              kind: "duplicate",
              message: outcome.message,
              name: fullName(
                outcome.employee.first_name,
                outcome.employee.last_name,
              ),
              employeeId: outcome.employee.employee_id,
              position: outcome.employee.position,
              time: formatScanTime(outcome.last_scanned_at),
              dwellMs: DWELL_MS,
            }),
            null,
          );
          setConnection("ok");
          refreshLog();
          break;
        case "failed":
          showProblem(outcome.message || SCAN_FAILED_MESSAGE);
          setConnection("ok");
          break;
        case "error":
          showProblem(outcome.message || SERVER_ERROR_FALLBACK);
          setConnection("ok");
          break;
        case "unreachable":
          showProblem(UNREACHABLE_MESSAGE);
          setConnection("unreachable");
          break;
      }
    },
    [lockFor, orgName, printer, refreshLog, setConnection, showProblem, showResult, ticket],
  );

  const scan = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      const now = Date.now();

      if (inflight.current || now < lockedUntil.current) {
        dispatch({ type: "HINT", on: true });
        clearTimeout(timers.current.hint);
        timers.current.hint = setTimeout(
          () => dispatch({ type: "HINT", on: false }),
          HINT_MS,
        );
        return;
      }

      const prev = last.current;
      if (prev && prev.ok && prev.code === code && now - prev.at < SAME_CODE_MS) {
        return;
      }

      if (!code || !scanRequestSchema.safeParse({ code }).success) {
        last.current = { code, at: now, ok: false };
        lockFor(LOCK_MS);
        showProblem(SCAN_FAILED_MESSAGE);
        return;
      }

      inflight.current = true;
      dispatch({ type: "BUSY", busy: true });
      clearTimeout(timers.current.slow);
      timers.current.slow = setTimeout(() => {
        if (inflight.current) dispatch({ type: "SLOW" });
      }, SLOW_MS);
      void postScan(code).then((outcome) => handleOutcome(outcome, code));
    },
    [handleOutcome, lockFor, showProblem],
  );

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.dwell);
      clearTimeout(t.lock);
      clearTimeout(t.hint);
      clearTimeout(t.slow);
      clearTimeout(t.highlight);
    };
  }, []);

  return { state, scan };
}
