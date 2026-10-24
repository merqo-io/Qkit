"use client";

import { useEffect, useState } from "react";

/**
 * Current epoch ms, re-rendering every `intervalMs` so "time ago" / countdown UI
 * stays live. Pass `enabled = false` to stop ticking (e.g. once an order is
 * terminal).
 *
 * Returns `null` until mounted. Seeding `Date.now()` during render made the
 * server HTML and the client hydration disagree on any elapsed label once a
 * minute boundary passed between them (React #418 on the dashboard), so the
 * clock is only ever read in an effect. Consumers render a stable placeholder
 * while it is `null`. Same pattern as queue-display.tsx and
 * order-status-poller.tsx.
 */
export function useNow(intervalMs: number, enabled = true): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is only readable after mount
    setNow(Date.now());
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  return now;
}
