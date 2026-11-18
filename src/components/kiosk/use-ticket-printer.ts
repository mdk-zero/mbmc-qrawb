"use client";

import { useEffect, useMemo, useRef } from "react";
import type { TicketOptions } from "@/lib/contracts/settings";
import { TICKET_TEMPLATE } from "./ticket-template";

export type TicketJob = {
  queueNumber: number;
  name: string;
  orgName: string;
  scanTime: string;
  ticket: TicketOptions;
};

const QUEUE_MAX = 10;
const READY_TIMEOUT_MS = 3000;
const DECODE_TIMEOUT_MS = 2000;
const GAP_MS = 500;
const AFTERPRINT_TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nextFrame = (win: Window) =>
  new Promise<void>((r) => win.requestAnimationFrame(() => r()));

function restoreFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
  window.focus();
}

function waitForFrame(frame: HTMLIFrameElement): Promise<Document> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const doc = frame.contentDocument;
      return doc && doc.readyState === "complete" && doc.querySelector(".number")
        ? doc
        : null;
    };
    const ready = check();
    if (ready) return resolve(ready);
    const timer = setTimeout(() => {
      frame.removeEventListener("load", onLoad);
      reject(new Error("Ticket frame did not load"));
    }, READY_TIMEOUT_MS);
    function onLoad() {
      const doc = check();
      if (!doc) return;
      clearTimeout(timer);
      frame.removeEventListener("load", onLoad);
      resolve(doc);
    }
    frame.addEventListener("load", onLoad);
  });
}

async function decodeLogo(img: HTMLImageElement) {
  try {
    await Promise.race([
      img.decode(),
      sleep(DECODE_TIMEOUT_MS).then(() => {
        throw new Error("logo decode timeout");
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function printOne(frame: HTMLIFrameElement, job: TicketJob) {
  const doc = await waitForFrame(frame);
  const win = frame.contentWindow;
  if (!win) throw new Error("Ticket frame has no window");

  const q = <T extends HTMLElement>(sel: string) => doc.querySelector<T>(sel)!;
  q(".number").textContent = String(job.queueNumber);
  q(".name").textContent = job.name;

  const { show_logo, show_org_name, show_scan_time } = job.ticket;
  const logo = q<HTMLImageElement>(".logo");
  const org = q(".org");
  const header = q(".header");
  const time = q(".time");

  org.textContent = job.orgName;
  org.hidden = !show_org_name;
  time.textContent = job.scanTime;
  time.hidden = !show_scan_time;
  logo.hidden = !show_logo;
  header.hidden = !(show_logo || show_org_name);

  if (show_logo && !(await decodeLogo(logo))) logo.hidden = true;

  await doc.fonts?.ready;
  await nextFrame(win);
  await nextFrame(win);

  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(watchdog);
      win.removeEventListener("afterprint", onAfterPrint);
      if (error) reject(error);
      else resolve();
    };
    const onAfterPrint = () => finish();
    const watchdog = setTimeout(
      () => finish(new Error("afterprint did not fire")),
      AFTERPRINT_TIMEOUT_MS,
    );
    win.addEventListener("afterprint", onAfterPrint);
    try {
      win.print();
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function useTicketPrinter({
  onFailed,
}: {
  onFailed: (queueNumber: number) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const queue = useRef<TicketJob[]>([]);
  const running = useRef(false);
  const disposed = useRef(false);
  const onFailedRef = useRef(onFailed);
  useEffect(() => {
    onFailedRef.current = onFailed;
  });

  const pump = useMemo(() => {
    async function run() {
      if (running.current) return;
      running.current = true;
      while (queue.current.length && !disposed.current) {
        const job = queue.current.shift()!;
        const frame = frameRef.current;
        try {
          if (!frame) throw new Error("Ticket frame missing");
          await printOne(frame, job);
          window.dispatchEvent(
            new CustomEvent("kiosk:ticket-printed", {
              detail: { queueNumber: job.queueNumber, name: job.name },
            }),
          );
        } catch (error) {
          console.error("Ticket printing failed", error);
          onFailedRef.current(job.queueNumber);
        }
        restoreFocus();
        await sleep(GAP_MS);
      }
      running.current = false;
    }
    return run;
  }, []);

  useEffect(() => {
    disposed.current = false;
    const frame = document.createElement("iframe");
    frame.title = "Ticket";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "1px",
      height: "1px",
      border: "0",
      opacity: "0",
      pointerEvents: "none",
    });
    frame.srcdoc = TICKET_TEMPLATE;
    document.body.appendChild(frame);
    frameRef.current = frame;

    function onBlur() {
      setTimeout(() => {
        if (!document.hidden && !disposed.current) window.focus();
      }, 100);
    }
    function onFocusIn(event: FocusEvent) {
      if (event.target instanceof HTMLElement) event.target.blur();
    }
    window.addEventListener("blur", onBlur);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      disposed.current = true;
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("focusin", onFocusIn);
      frame.remove();
      frameRef.current = null;
      queue.current = [];
      running.current = false;
    };
  }, []);

  return useMemo(
    () => ({
      enqueue(job: TicketJob) {
        if (queue.current.length >= QUEUE_MAX) {
          onFailedRef.current(job.queueNumber);
          return;
        }
        queue.current.push(job);
        void pump();
      },
    }),
    [pump],
  );
}
