import { CircleAlert, CircleCheck, Copy, Printer, type LucideIcon } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ResultView } from "./use-scan-controller";

const BODY = "text-[clamp(1.125rem,1.15vw,1.375rem)]";

type Tone = {
  icon: LucideIcon;
  title: string;
  badge: string;
  card: string;
  badgeClass: string;
  bar: string;
  iconClass: string;
};

const TONES: Record<"success" | "duplicate" | "problem", Tone> = {
  success: {
    icon: CircleCheck,
    title: "Scan successful",
    badge: "Attendance recorded",
    card: "bg-emerald-50 border-emerald-300 text-emerald-950",
    badgeClass: "bg-emerald-600 text-white",
    bar: "bg-emerald-600",
    iconClass: "text-emerald-600",
  },
  duplicate: {
    icon: Copy,
    title: "Duplicate scan",
    badge: "Already recorded",
    card: "bg-amber-50 border-amber-300 text-amber-950",
    badgeClass: "bg-amber-500 text-amber-950",
    bar: "bg-amber-500",
    iconClass: "text-amber-600",
  },
  problem: {
    icon: CircleAlert,
    title: "Scan failed",
    badge: "Action required",
    card: "bg-rose-50 border-rose-300 text-rose-950",
    badgeClass: "bg-rose-600 text-white",
    bar: "bg-rose-600",
    iconClass: "text-rose-600",
  },
};

const FOOTERS = {
  success: "Your attendance has been processed successfully.",
  duplicate: "Your existing attendance record has been preserved.",
  problem: "Please check the message above and try again if needed.",
};

function Identity({
  name,
  meta,
}: {
  name: string;
  meta: string;
}) {
  return (
    <div className="text-center">
      <p className="text-[clamp(2rem,3.2vw,3.5rem)] leading-tight font-bold">
        {name}
      </p>
      <p className={cn(BODY, "opacity-80")}>{meta}</p>
    </div>
  );
}

function metaLine(employeeId: string, position: string, tail: string) {
  return [employeeId || "No ID", position, tail].filter(Boolean).join("  •  ");
}

export function ResultCard({ result }: { result: ResultView }) {
  const tone = TONES[result.kind];
  const Icon = tone.icon;

  return (
    <div
      data-result={result.kind}
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border-2 shadow-sm",
        tone.card,
      )}
    >
      <div className="flex items-center justify-between gap-4 px-8 pt-6">
        <div className="flex items-center gap-3">
          <Icon className={cn("size-[clamp(2rem,3vw,3rem)]", tone.iconClass)} aria-hidden />
          <h2 className="text-[clamp(1.75rem,2.9vw,3.25rem)] leading-none font-bold">
            {tone.title}
          </h2>
        </div>
        <Badge
          className={cn(
            "h-auto px-4 py-1.5 text-[clamp(1rem,1.1vw,1.25rem)]",
            tone.badgeClass,
          )}
        >
          {tone.badge}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 py-3 text-center">
        {result.kind === "success" && (
          <>
            <p className={cn(BODY, "tracking-[0.2em] uppercase opacity-80")}>
              Queue number
            </p>
            <p
              data-testid="queue-number"
              className="text-[clamp(7rem,11vw,12.5rem)] leading-[0.95] font-black tabular-nums"
            >
              {result.queueNumber}
            </p>
            <Identity
              name={result.name}
              meta={metaLine(result.employeeId, result.position, result.time)}
            />
            {result.printError ? (
              <Alert
                variant="destructive"
                className="mt-2 w-auto max-w-full border-rose-300 bg-rose-50 px-4 py-3"
              >
                <Printer />
                <AlertTitle className={BODY}>
                  The ticket could not be printed. Please ask HR to reprint it.
                </AlertTitle>
              </Alert>
            ) : (
              <p className="mt-1 text-[clamp(1.25rem,1.6vw,1.75rem)] font-semibold">
                Please take your printed ticket.
              </p>
            )}
          </>
        )}

        {result.kind === "duplicate" && (
          <>
            <p className="max-w-[26ch] text-[clamp(1.5rem,2vw,2.25rem)] leading-snug font-semibold text-balance">
              {result.message}
            </p>
            <Identity
              name={result.name}
              meta={metaLine(
                result.employeeId,
                result.position,
                `Last scanned ${result.time}`,
              )}
            />
          </>
        )}

        {result.kind === "problem" && (
          <p className="max-w-[26ch] text-[clamp(1.5rem,2.2vw,2.5rem)] leading-snug font-semibold text-balance">
            {result.message}
          </p>
        )}
      </div>

      <p className={cn(BODY, "px-8 pb-4 text-center opacity-80")}>
        {FOOTERS[result.kind]}
      </p>
      <div className="h-2 w-full bg-black/5">
        <div
          key={`${result.id}-${result.dwellMs}`}
          className={cn("h-full origin-left", tone.bar)}
          style={{
            animation: `dwell-shrink ${result.dwellMs}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}
