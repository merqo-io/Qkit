import Link from "next/link";
import { Button } from "@merqo/ui/primitives";

/** Branded 404 for the Merqo-team admin console — see
 * dashboard/not-found.tsx for why this can't reuse the root's
 * customer/QR-code copy. */
export default function AdminNotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-5xl font-bold text-primary">404</p>
      <h1 className="font-display text-3xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        That admin page doesn&apos;t exist, or the link is out of date.
      </p>
      <Button asChild variant="outline" className="h-11 rounded-xl px-6">
        <Link href="/admin">Back to admin</Link>
      </Button>
    </div>
  );
}
