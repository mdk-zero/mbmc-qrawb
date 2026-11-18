import { TriangleAlert } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";

export function OfflineBanner() {
  return (
    <Alert
      variant="destructive"
      className="rounded-none border-x-0 bg-rose-50 px-8 py-3 text-[clamp(1.125rem,1.15vw,1.375rem)]"
    >
      <TriangleAlert />
      <AlertTitle>
        Server unreachable. Scans are not being recorded. Retrying…
      </AlertTitle>
    </Alert>
  );
}
