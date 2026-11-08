"use client";

import { useEffect } from "react";
import { fireReadyNotification, playReadyChime } from "@/lib/order-alerts";
import type { OrderStatus } from "@/lib/types";

export function useReadyAlert(
  status: OrderStatus,
  boothName: string,
  displayNumber: string,
): void {
  // Alert the moment the order flips to ready. setState bails on an identical
  // value, so this fires once per real transition, not every poll.
  useEffect(() => {
    if (status !== "ready") return;

    // System popup — reaches the customer even with the tab backgrounded
    // (where supported + granted); a no-op otherwise.
    void fireReadyNotification(
      boothName,
      displayNumber,
      // Keep the ?t=<token> query — the status page now requires it, so a
      // notification-tap that opens the page fresh must carry the token.
      window.location.pathname + window.location.search,
    );

    if (!document.hidden) {
      void playReadyChime();
      return;
    }

    // Backgrounded: flash the tab title until the customer comes back, then
    // restore it and chime once they're looking.
    const original = document.title;
    let on = false;
    const flash = setInterval(() => {
      on = !on;
      document.title = on ? "🔔 Order ready!" : original;
    }, 1000);
    function onVisible() {
      if (document.hidden) return;
      clearInterval(flash);
      document.title = original;
      void playReadyChime();
      document.removeEventListener("visibilitychange", onVisible);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(flash);
      document.title = original;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, boothName, displayNumber]);
}
