"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** The slice of a board booth this hook reads. */
type CappedBooth = {
  id: string;
  daily_cup_cap?: number | null;
  cups_today?: number;
};

type LiveCount<B> = { value: number; source: B };

/**
 * Keeps each capped booth's "N/cap items" count current while the board is
 * open. The server page reads booth_cups_today once at load; this re-reads it
 * for one booth whenever the realtime channel reports a change to one of its
 * orders (an insert, a cancel, an un-cancel), so the count follows a rush
 * without a reload. Re-reading rather than counting the realtime rows keeps
 * the midnight and "Start new service" window in one place, the RPC.
 *
 * A fetched count is tied to the booth object it was fetched against. A
 * router.refresh() (Start new service, a pause toggle) hands the board new
 * booth objects carrying a fresh server count, and every older live count,
 * including one still in flight, then gives way to it.
 *
 * At most one request per booth is in flight: a change that lands meanwhile
 * queues a single follow-up read, so a burst ("Mark all ready") costs two
 * reads, not one per order.
 */
export function useCupsToday<B extends CappedBooth>(booths: B[]) {
  const supabase = createClient();
  const [live, setLive] = useState<Map<string, LiveCount<B>>>(new Map());
  const boothsRef = useRef(booths);
  useEffect(() => {
    boothsRef.current = booths;
  });
  const inFlight = useRef(new Set<string>());
  const queued = useRef(new Set<string>());

  const fetchOne = useCallback(
    async (boothId: string) => {
      if (inFlight.current.has(boothId)) {
        queued.current.add(boothId);
        return;
      }
      const source = boothsRef.current.find((b) => b.id === boothId);
      if (
        !source ||
        source.daily_cup_cap === null ||
        source.daily_cup_cap === undefined
      )
        return;
      inFlight.current.add(boothId);
      try {
        const { data, error } = await supabase.rpc("booth_cups_today", {
          p_booth_id: boothId,
        });
        if (error) {
          console.error("board booth_cups_today failed", error.message);
        } else if (typeof data === "number") {
          setLive((prev) =>
            new Map(prev).set(boothId, { value: data, source }),
          );
        }
      } catch {
        console.error("board booth_cups_today request failed");
      } finally {
        inFlight.current.delete(boothId);
        if (queued.current.delete(boothId)) void fetchOne(boothId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the supabase client is stable
    [],
  );

  /** Re-read one booth's count, or every capped booth's for null. */
  const refreshCups = useCallback(
    (boothId: string | null) => {
      const ids =
        boothId === null
          ? boothsRef.current
              .filter(
                (b) =>
                  b.daily_cup_cap !== null && b.daily_cup_cap !== undefined,
              )
              .map((b) => b.id)
          : [boothId];
      for (const id of ids) void fetchOne(id);
    },
    [fetchOne],
  );

  /** The booth with its live count, or as given when none is newer. */
  const withLiveCount = useCallback(
    (b: B): B => {
      const entry = live.get(b.id);
      return entry && entry.source === b
        ? { ...b, cups_today: entry.value }
        : b;
    },
    [live],
  );

  return { withLiveCount, refreshCups };
}
