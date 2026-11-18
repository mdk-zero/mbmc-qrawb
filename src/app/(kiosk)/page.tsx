import { Suspense } from "react";
import { KioskData } from "./kiosk-data";
import { KioskShell } from "./kiosk-shell";

export default function KioskPage() {
  return (
    <Suspense fallback={<KioskShell />}>
      <KioskData />
    </Suspense>
  );
}
