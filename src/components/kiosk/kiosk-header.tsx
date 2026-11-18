import Image from "next/image";
import { KioskClock } from "./kiosk-clock";

export function KioskHeader({
  orgName,
  timezone,
  serverOffsetMs,
}: {
  orgName: string;
  timezone: string;
  serverOffsetMs: number;
}) {
  return (
    <header className="flex items-center justify-between gap-6 border-b bg-card px-8 py-3">
      <div className="flex items-center gap-4">
        <Image
          src="/logo.png"
          alt=""
          width={72}
          height={72}
          unoptimized
          priority
          className="size-14 object-contain min-[1700px]:size-[72px]"
        />
        <div className="leading-tight">
          <h1 className="text-[clamp(1.5rem,2.2vw,2.5rem)] font-bold">
            {orgName}
          </h1>
          <p className="text-[clamp(1.125rem,1.15vw,1.375rem)] text-muted-foreground">
            Employee Attendance
          </p>
        </div>
      </div>
      <KioskClock timezone={timezone} serverOffsetMs={serverOffsetMs} />
    </header>
  );
}
