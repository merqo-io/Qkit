import Link from "next/link";
import { Button } from "@merqo/ui/primitives";

/** Branded 404 for the vendor dashboard tree — a stale bookmark or mistyped
 * URL here isn't a customer holding a QR code, so it must not tell a vendor
 * to "scan the booth's QR code" (the root app/not-found.tsx copy). */
export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-5xl font-bold text-primary">404</p>
      <h1 className="font-display text-3xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        That dashboard page doesn&apos;t exist, or the link is out of date.
      </p>
      <Button asChild variant="outline" className="h-11 rounded-xl px-6">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
