import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";

export function KioskShell() {
  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-muted/40">
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
            <p className="text-[clamp(1.5rem,2.2vw,2.5rem)] font-bold">
              Employee Attendance
            </p>
          </div>
        </div>
        <div className="text-[clamp(2rem,2.9vw,3.25rem)] font-semibold tabular-nums text-muted-foreground">
          --:--
        </div>
      </header>
      <main className="grid min-h-0 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex items-center justify-center p-4">
          <Skeleton className="h-2/3 w-2/3 rounded-2xl" />
        </div>
        <div className="space-y-4 border-l bg-card p-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </main>
      <footer className="border-t bg-card px-8 py-2 text-[clamp(1rem,1vw,1.125rem)] text-muted-foreground">
        Employee Attendance System
      </footer>
    </div>
  );
}
