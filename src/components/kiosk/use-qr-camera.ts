"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraStatus } from "./camera-status";
import { getDetector } from "./zxing";

const RETRY_MS: Partial<Record<CameraStatus, number>> = {
  "no-camera": 30_000,
  "in-use": 10_000,
  error: 30_000,
};

function statusForError(error: unknown): CameraStatus {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "no-camera";
    case "NotReadableError":
    case "AbortError":
      return "in-use";
    case "SecurityError":
      return "insecure";
    default:
      return "error";
  }
}

type Options = {
  enabled: boolean;
  paused: boolean;
  onDetect: (code: string) => void;
  intervalMs?: number;
};

export function useQrCamera({
  enabled,
  paused,
  onDetect,
  intervalMs = 150,
}: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const pausedRef = useRef(paused);
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    pausedRef.current = paused;
    onDetectRef.current = onDetect;
  });

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let loopTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failedWith: CameraStatus | null = null;
    const video = videoRef.current;

    function fail(next: CameraStatus) {
      if (cancelled) return;
      failedWith = next;
      setStatus(next);
      const delay = RETRY_MS[next];
      if (delay) retryTimer = setTimeout(retry, delay);
    }

    async function detectLoop() {
      if (cancelled || !video) return;
      try {
        if (!pausedRef.current && !document.hidden && video.readyState >= 2) {
          const detector = await getDetector();
          const found = await detector.detect(video);
          const code = found[0]?.rawValue?.trim();
          if (!cancelled && code) onDetectRef.current(code);
        }
      } catch (error) {
        console.error("QR detect failed", error);
      }
      if (!cancelled) loopTimer = setTimeout(detectLoop, intervalMs);
    }

    async function start() {
      setStatus("loading");
      try {
        await getDetector();
      } catch (error) {
        console.error("Could not load the QR decoder", error);
        return fail("error");
      }
      if (cancelled) return;

      if (!navigator.mediaDevices?.getUserMedia) return fail("insecure");
      setStatus("starting");
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;
        if (!video) throw new Error("No video element");
        video.srcObject = media;
        await video.play();
        if (cancelled) return;
        setStatus("running");
        void detectLoop();
      } catch (error) {
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        if (cancelled) return;
        if (!(error instanceof DOMException)) {
          console.error("Camera start failed", error);
        }
        fail(statusForError(error));
      }
    }

    const onDeviceChange = () => {
      if (failedWith === "no-camera") retry();
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    void start();

    return () => {
      cancelled = true;
      clearTimeout(loopTimer);
      clearTimeout(retryTimer);
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [enabled, attempt, intervalMs, retry]);

  return { videoRef, status, retry };
}
