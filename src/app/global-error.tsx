/* eslint-disable no-restricted-syntax -- renders without the app stylesheet, so colours stay literal */
"use client";

import { GlobalError } from "@merqo/ui";

// Replaces the root layout, so the stylesheet is absent: colours are copies of
// the brand tokens and the font is a system stack.
export default function RootGlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <GlobalError
      reset={reset}
      colors={{
        background: "#f5efe4",
        foreground: "#2b2620",
        mutedForeground: "#6b6152",
        primary: "#c2410c",
        primaryForeground: "#fff",
      }}
      radius="0.5rem"
      fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
      title="Something went wrong"
      description="An unexpected error interrupted the page. Please try again, and if it keeps happening, refresh in a moment."
      resetLabel="Try again"
      lang="en"
    />
  );
}
