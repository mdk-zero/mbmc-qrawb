import { CameraOff, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CameraStatus } from "./camera-status";

const TILES: Partial<Record<CameraStatus, { title: string; body: string }>> = {
  loading: { title: "Starting camera…", body: "Please wait." },
  starting: {
    title: "Starting camera…",
    body: "Please allow camera access when your browser requests permission.",
  },
  denied: {
    title: "Camera not available",
    body: "Camera unavailable. Allow camera access to use the scanner. You can still use the scanner.",
  },
  "no-camera": {
    title: "Camera not available",
    body: "Connect a camera to use the scanner.",
  },
  "in-use": {
    title: "Camera not available",
    body: "The camera is being used by another program. Retrying…",
  },
  insecure: {
    title: "Camera not available",
    body: "The camera only works when the kiosk is opened at http://localhost:3000.",
  },
  error: {
    title: "Camera not available",
    body: "Camera scanning could not start. Use the scanner.",
  },
};

export function CameraTile({ status }: { status: CameraStatus }) {
  const tile = TILES[status];
  if (!tile) return null;
  const busy = status === "loading" || status === "starting";
  const Icon = busy ? LoaderCircle : CameraOff;
  return (
    <div
      data-camera-status={status}
      className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border bg-muted/50 px-6 text-center"
    >
      <Icon
        className={cn("size-10 text-muted-foreground", busy && "animate-spin")}
        aria-hidden
      />
      <p className="text-[clamp(1.25rem,1.6vw,1.75rem)] font-semibold">
        {tile.title}
      </p>
      <p className="max-w-[40ch] text-[clamp(1.125rem,1.15vw,1.375rem)] text-muted-foreground">
        {tile.body}
      </p>
    </div>
  );
}

