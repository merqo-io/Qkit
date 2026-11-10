"use client";

import { useEffect } from "react";
import { Button } from "@merqo/ui/primitives";

import { EYEBROW_CLASS } from "@/lib/utils";

/**
 * Root error boundary — replaces the raw Next error overlay in production if an
 * RSC throws (e.g. Supabase unreachable on patchy event-site signal).
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <p className={EYEBROW_CLASS}>Something went wrong</p>
      <h1 className="font-display text-3xl font-semibold">
        That didn&apos;t load
      </h1>
      <p className="text-sm text-muted-foreground">
        A hiccup on our end, usually a flaky connection. Try again.
      </p>
      <Button onClick={reset} className="h-11 rounded-xl px-6 font-semibold">
        Try again
      </Button>
    </div>
  );
}
