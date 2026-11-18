"use client";

import { useEffect } from "react";

export default function KioskError({ retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    const timer = setInterval(retry, 10_000);
    return () => clearInterval(timer);
  }, [retry]);

  return (
    <div className="flex h-dvh items-center justify-center bg-muted/40 text-center">
      <p className="text-[clamp(1.5rem,2.2vw,2.5rem)] font-semibold">
        Something went wrong. Restarting the scanner…
      </p>
    </div>
  );
}
