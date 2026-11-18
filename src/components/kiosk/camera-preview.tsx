"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { CameraTile } from "./camera-tile";
import { useQrCamera } from "./use-qr-camera";

export default function CameraPreview({
  paused,
  onDetect,
  onStatus,
}: {
  paused: boolean;
  onDetect: (code: string) => void;
  onStatus: (running: boolean) => void;
}) {
  const { videoRef, status } = useQrCamera({ enabled: true, paused, onDetect });

  useEffect(() => {
    onStatus(status === "running");
    return () => onStatus(false);
  }, [status, onStatus]);

  const running = status === "running";

  return (
    <div className="relative h-full w-full" data-camera-status={status}>
      <video
        ref={videoRef}
        muted
        playsInline
        tabIndex={-1}
        className={cn(
          "h-full w-full scale-x-[-1] rounded-2xl bg-black object-cover",
          !running && "hidden",
        )}
      />
      {running && (
        <div aria-hidden className="pointer-events-none absolute inset-[12%]">
          <span className="absolute top-0 left-0 size-10 rounded-tl-xl border-t-4 border-l-4 border-white/90" />
          <span className="absolute top-0 right-0 size-10 rounded-tr-xl border-t-4 border-r-4 border-white/90" />
          <span className="absolute bottom-0 left-0 size-10 rounded-bl-xl border-b-4 border-l-4 border-white/90" />
          <span className="absolute right-0 bottom-0 size-10 rounded-br-xl border-r-4 border-b-4 border-white/90" />
        </div>
      )}
      {!running && (
        <div className="absolute inset-0">
          <CameraTile status={status} />
        </div>
      )}
    </div>
  );
}
