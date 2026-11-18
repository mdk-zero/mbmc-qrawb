"use client";

import { useEffect, type RefObject } from "react";

const IDLE_MS = 3000;

export function useHideIdleCursor(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    function hide() {
      el!.style.cursor = "none";
    }
    function onMove() {
      el!.style.cursor = "";
      clearTimeout(timer);
      timer = setTimeout(hide, IDLE_MS);
    }
    timer = setTimeout(hide, IDLE_MS);
    window.addEventListener("mousemove", onMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
      el.style.cursor = "";
    };
  }, [ref]);
}
