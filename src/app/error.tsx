"use client";

import { ErrorPage } from "@merqo/ui";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPage
      error={error}
      reset={reset}
      eyebrow="Something went wrong"
      title="That didn't load"
      description="A hiccup on our end, usually a flaky connection. Try again."
      resetLabel="Try again"
    />
  );
}
