import { QrCode } from "lucide-react";

export function IdlePrompt({ cameraOn }: { cameraOn: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 text-center">
      {!cameraOn && (
        <QrCode
          className="size-[clamp(5rem,8vw,9rem)] text-muted-foreground"
          strokeWidth={1.25}
          aria-hidden
        />
      )}
      <h2 className="text-[clamp(2.5rem,3.5vw,4rem)] leading-none font-bold">
        Ready to scan
      </h2>
      <p className="max-w-[28ch] text-[clamp(1.125rem,1.15vw,1.375rem)] text-balance text-muted-foreground">
        {cameraOn
          ? "Scan your ID card with the scanner, or hold its QR code up to the camera."
          : "Scan the QR code on your ID card with the scanner to record your attendance."}
      </p>
      <div className="mt-2 flex items-center gap-3 rounded-full border bg-card px-5 py-2 text-[clamp(1.125rem,1.15vw,1.375rem)]">
        <span className="relative flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-sky-500" />
        </span>
        Waiting for QR code
      </div>
    </div>
  );
}
