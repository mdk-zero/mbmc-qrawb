import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { TodayAttendanceResponse } from "@/lib/contracts/attendance";
import { cn } from "@/lib/utils";
import { formatLogDate, formatScanTime } from "./format";
import type { Highlight } from "./use-scan-controller";

const MAX_ROWS = 100;
const BODY = "text-[clamp(1.125rem,1.15vw,1.375rem)]";

export function TodayLog({
  log,
  failed,
  highlight,
}: {
  log: TodayAttendanceResponse | null;
  failed: boolean;
  highlight: Highlight | null;
}) {
  const total = log?.entries.length ?? 0;
  const rows = log?.entries.slice(0, MAX_ROWS) ?? [];

  return (
    <aside
      aria-label="Today's scan logs"
      className="flex min-h-0 flex-col border-l bg-card"
    >
      <div className="flex items-center justify-between gap-3 border-b px-6 py-3">
        <div>
          <h2 className="text-[clamp(1.25rem,1.6vw,1.75rem)] font-bold">
            Today&apos;s scan logs
          </h2>
          <p className={cn(BODY, "text-muted-foreground")}>
            {log ? formatLogDate(log.date) : " "}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {log && (
            <Badge variant="secondary" className={cn("h-auto px-3 py-1 tabular-nums", BODY)}>
              {total} {total === 1 ? "scan" : "scans"}
            </Badge>
          )}
          {log && failed && (
            <span className="text-base font-medium text-amber-700">
              Last updated {formatScanTime(log.generated_at)}
            </span>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!log && !failed && <LogSkeleton />}
        {!log && failed && (
          <p className={cn(BODY, "p-6 text-muted-foreground")}>
            Scan log unavailable. Retrying…
          </p>
        )}
        {log && rows.length === 0 && (
          <div className="p-6">
            <p className="text-[clamp(1.25rem,1.6vw,1.75rem)] font-semibold">
              No scans recorded yet
            </p>
            <p className={cn(BODY, "text-muted-foreground")}>
              The current day&apos;s attendance list will appear here after each scan.
            </p>
          </div>
        )}
        {log && rows.length > 0 && (
          <Table>
            <TableBody>
              {rows.map((entry) => {
                const hot =
                  highlight?.queueNumber === entry.queue_number &&
                  highlight.employeeId === entry.employee_id;
                return (
                  <TableRow
                    key={entry.id}
                    className={cn("transition-colors", hot && "bg-emerald-100 hover:bg-emerald-100")}
                  >
                    <TableCell className="w-16 py-3 pl-6 text-center text-[clamp(1.5rem,2vw,2.25rem)] font-bold tabular-nums">
                      {entry.queue_number}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="text-[clamp(1.25rem,1.25vw,1.5rem)] leading-tight font-semibold">
                        {entry.name || "Unknown employee"}
                      </div>
                      <div className="text-base text-muted-foreground">
                        {entry.employee_id || "No ID"}
                        {entry.position ? ` • ${entry.position}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 pr-6 text-right whitespace-nowrap tabular-nums text-[clamp(1.125rem,1.15vw,1.375rem)]">
                      {formatScanTime(entry.scanned_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
      </div>
    </aside>
  );
}

function LogSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
