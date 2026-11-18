"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CameraPanel } from "./camera-panel";
import { IdlePrompt } from "./idle-prompt";
import { ResultCard } from "./result-card";
import type { ResultView } from "./use-scan-controller";

type Props = {
  view: "idle" | "submitting" | "result";
  result: ResultView | null;
  busy: boolean;
  hint: boolean;
  cameraEnabled: boolean;
  onDetect: (code: string) => void;
};

export function ScanStage({
  view,
  result,
  busy,
  hint,
  cameraEnabled,
  onDetect,
}: Props) {
  const [cameraRunning, setCameraRunning] = useState(false);

  const strip = hint
    ? "Please wait a moment, then scan again."
    : busy
      ? "Please wait"
      : "Ready for the next scan";

  return (
    <section className="flex min-h-0 flex-col" aria-label="Scan stage">
      <div className="relative min-h-0 flex-1 p-4">
        <div className="flex h-full flex-col items-center justify-center gap-5">
          {cameraEnabled && (
            <div className="aspect-[4/3] h-[55%] max-w-full">
              <CameraPanel
                paused={busy}
                onDetect={onDetect}
                onStatus={setCameraRunning}
              />
            </div>
          )}
          <IdlePrompt cameraOn={cameraEnabled} />
        </div>

        {view === "submitting" && (
          <div
            role="status"
            className="absolute inset-4 flex flex-col items-center justify-center gap-4 rounded-2xl border bg-card"
          >
            <LoaderCircle className="size-20 animate-spin text-muted-foreground" aria-hidden />
            <p className="text-[clamp(2rem,2.9vw,3.25rem)] font-semibold">
              Checking your ID…
            </p>
          </div>
        )}

        {view === "result" && result && (
          <div className="absolute inset-4" role="status" aria-live="polite">
            <ResultCard result={result} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t bg-card px-8 py-3 text-[clamp(1.125rem,1.15vw,1.375rem)]">
        <span className="flex items-center gap-3" data-testid="ready-strip">
          <span
            className={cn(
              "size-3 rounded-full",
              busy || hint ? "bg-amber-500" : "bg-emerald-500",
              hint && "animate-pulse",
            )}
          />
          {strip}
        </span>
        {cameraEnabled && cameraRunning && (
          <span className="flex items-center gap-3 text-muted-foreground">
            <span className="size-3 rounded-full bg-emerald-500" />
            Camera on
          </span>
        )}
      </div>
    </section>
  );
}
