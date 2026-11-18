"use client";

import { useEffect, useRef } from "react";

const KEY_GAP_MS = 300;
const BUFFER_MAX = 64;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function useScannerInput(onScan: (code: string) => void) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let buffer = "";
    let lastKeyAt = 0;

    function handler(event: KeyboardEvent) {
      if (isEditable(event.target)) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.isComposing) return;

      const now = Date.now();
      if (now - lastKeyAt > KEY_GAP_MS) buffer = "";
      lastKeyAt = now;

      if (event.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (code) {
          event.preventDefault();
          onScanRef.current(code);
        }
        return;
      }
      if (event.key.length === 1 && buffer.length < BUFFER_MAX) {
        buffer += event.key;
      }
    }

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);
}
