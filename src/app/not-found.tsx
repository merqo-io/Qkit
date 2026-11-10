import Link from "next/link";
import { Button } from "@merqo/ui/primitives";

/** Branded 404 — reached e.g. when a customer opens a stale/mistyped order URL. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-5xl font-bold text-primary">404</p>
      <h1 className="font-display text-3xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This page or order doesn&apos;t exist. Scan the booth&apos;s QR code
        again to start a fresh order.
      </p>
      <Button asChild variant="outline" className="h-11 rounded-xl px-6">
        <Link href="/">Back to start</Link>
      </Button>
    </div>
  );
}
