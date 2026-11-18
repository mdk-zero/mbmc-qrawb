"use client";

import { useEffect, useState } from "react";
import { formatClockParts } from "./format";

export function KioskClock({
  timezone,
  serverOffsetMs,
}: {
  timezone: string;
  serverOffsetMs: number;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const t = Date.now();
      setNow(t);
      timer = setTimeout(tick, 1000 - (t % 1000) + 5);
    }
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, []);

  const parts = now === null ? null : formatClockParts(now + serverOffsetMs, timezone);

  return (
    <div className="text-right leading-tight tabular-nums">
      <div className="flex items-baseline justify-end gap-2 font-semibold text-[clamp(2rem,2.9vw,3.25rem)]">
        <span>
          {parts?.hm ?? "--:--"}
          <span className="text-[0.55em] text-muted-foreground">
            :{parts?.seconds ?? "--"}
          </span>
        </span>
        <span className="text-[0.55em] text-muted-foreground">
          {parts?.period ?? ""}
        </span>
      </div>
      <div className="min-h-[1.5em] text-[clamp(1.125rem,1.15vw,1.375rem)] text-muted-foreground">
        {parts?.date ?? ""}
      </div>
    </div>
  );
}
