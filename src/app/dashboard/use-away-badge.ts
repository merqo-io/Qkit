"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "New orders while away" tab-title badge: bumps a counter when the vendor's
 * tab is hidden, clears it the moment they look back, and reflects the count
 * in the tab title so a backgrounded vendor notices. Restores the original
 * title (captured post-hydration) once cleared. Returns the bump function —
 * the count itself is purely a tab-title side effect, never rendered.
 */
export function useAwayBadge(): () => void {
  const [away, setAway] = useState(0);
  const originalTitle = useRef("");

  useEffect(() => {
    originalTitle.current = document.title;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setAway(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (away > 0) document.title = `(${away}) New orders · qkit`;
    else if (originalTitle.current) document.title = originalTitle.current;
  }, [away]);

  return useCallback(() => setAway((n) => n + 1), []);
}
