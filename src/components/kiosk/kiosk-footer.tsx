import Link from "next/link";

export function KioskFooter() {
  return (
    <footer className="flex items-center justify-between border-t bg-card px-8 py-2 text-[clamp(1rem,1vw,1.125rem)] text-muted-foreground">
      <span>Employee Attendance System</span>
      <Link href="/admin" prefetch={false} tabIndex={-1} className="opacity-60 hover:opacity-100">
        Admin
      </Link>
    </footer>
  );
}
