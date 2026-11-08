"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleBoothActive } from "./booths/actions";
import type { BoothView } from "./board-booths";

/**
 * Optimistic is_active overrides, keyed by booth id — instant toggle feedback
 * ahead of the server round-trip/router.refresh(). Deliberately keyed on the
 * FULL `booths` prop, not the visible ones: a paused booth with no orders in
 * flight drops out of the visible list, which would otherwise make it
 * impossible to find and turn back on.
 */
export function useBoothActive(booths: BoothView[]) {
  const router = useRouter();
  const [activeOverrides, setActiveOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  function boothIsActive(b: BoothView) {
    return activeOverrides.get(b.id) ?? b.is_active;
  }
  // Instant toggle, no confirm gate — same instant-tap-plus-undo pattern as
  // OrderCard's advance buttons, for the same reason (a vendor pausing to
  // clear a rush-hour backlog needs this fast and reversible, not gated
  // behind a dialog). Also doubles as its own Undo handler (called with the
  // pre-toggle value).
  function setBoothActive(b: BoothView, active: boolean) {
    setActiveOverrides((prev) => new Map(prev).set(b.id, active));
    void (async () => {
      try {
        const res = await toggleBoothActive(b.id, active);
        if (!res.success) {
          toast.error(res.error);
          setActiveOverrides((prev) => new Map(prev).set(b.id, !active));
          return;
        }
        toast(active ? `${b.name} is open for orders` : `${b.name} is paused`, {
          action: { label: "Undo", onClick: () => setBoothActive(b, !active) },
        });
        router.refresh();
      } catch {
        setActiveOverrides((prev) => new Map(prev).set(b.id, !active));
        toast.error("Could not update the booth. Refresh to check its status.");
      }
    })();
  }
  const activeBoothCount = booths.filter(boothIsActive).length;
  return { boothIsActive, setBoothActive, activeBoothCount };
}
