"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyRealtimeOrderEvent,
  parseRealtimeOrderEvent,
} from "@/lib/realtime-orders";
import { BOARD_ORDER_COLUMNS, isTerminal } from "@/lib/orders";
import type { BoardOrder } from "@/lib/types";

export type RealtimeStatus = "connecting" | "connected" | "disconnected";

export function useRealtimeOrders(
  boothIds: string[],
  initialOrders: BoardOrder[],
  onInsert?: (order: BoardOrder) => void,
  // Any change to the order set: the order's booth for an insert or update,
  // null when the booth is unknown (a delete) or after a resync, which can
  // carry changes to any booth.
  onChange?: (boothId: string | null) => void,
): { orders: BoardOrder[]; status: RealtimeStatus } {
  const [orders, setOrders] = useState<BoardOrder[]>(initialOrders);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const supabase = createClient();
  const filterString = useMemo(() => boothIds.join(","), [boothIds]);
  const eventVersion = useRef(0);
  const changedAt = useRef(new Map<string, number>());
  const resyncVersion = useRef(0);

  // Hold the latest callback in a ref so a fresh closure each render doesn't
  // force a channel re-subscribe.
  const onInsertRef = useRef(onInsert);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onInsertRef.current = onInsert;
    onChangeRef.current = onChange;
  });

  // Re-fetch the active-order set (mirrors the dashboard server query in
  // dashboard/page.tsx) to heal any events missed while the socket was down.
  // RLS scopes it to the vendor's own booths.
  const resync = useCallback(async () => {
    if (boothIds.length === 0) return;
    const snapshotVersion = eventVersion.current;
    const requestVersion = ++resyncVersion.current;
    const data: BoardOrder[] = [];
    try {
      let afterId: string | null = null;
      // Keyset paging cannot skip the next row when an earlier order completes.
      while (true) {
        let query = supabase
          .from("orders")
          .select(BOARD_ORDER_COLUMNS)
          .in("booth_id", boothIds)
          .not("status", "in", "(completed,cancelled)")
          .order("id");
        if (afterId !== null) query = query.gt("id", afterId);
        const { data: page, error } = await query.limit(1000);
        if (requestVersion !== resyncVersion.current) return;
        if (error || !page) throw new Error("Could not load active orders");
        if (page.length === 0) break;
        data.push(...page);
        afterId = page[page.length - 1].id;
      }
    } catch (error) {
      console.error("useRealtimeOrders resync failed", error);
      return;
    }
    if (requestVersion !== resyncVersion.current) return;
    // Absence removes stale active rows, unless realtime changed that id during
    // the read. Keep terminal history for undo and passed-over indicators.
    setOrders((prev) => {
      const snapshotIds = new Set(data.map((row) => row.id));
      const changedDuringRead = (id: string) =>
        (changedAt.current.get(id) ?? 0) > snapshotVersion;
      const byId = new Map(
        prev
          .filter(
            (order) =>
              isTerminal(order.status) ||
              snapshotIds.has(order.id) ||
              changedDuringRead(order.id),
          )
          .map((order) => [order.id, order]),
      );
      for (const row of data) {
        if (changedDuringRead(row.id)) continue;
        const existing = byId.get(row.id);
        if (!existing || row.updated_at >= existing.updated_at)
          byId.set(row.id, row);
      }
      return [...byId.values()];
    });
    onChangeRef.current?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the supabase client is stable; only the booth filter matters
  }, [filterString]);

  useEffect(() => {
    if (boothIds.length === 0) return;
    const requests = resyncVersion;

    const channel = supabase
      .channel("vendor-orders")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "qkit",
          table: "orders",
          filter: `booth_id=in.(${filterString})`,
        },
        (payload) => {
          // Realtime payloads are untrusted — validate before use.
          const event = parseRealtimeOrderEvent(payload);
          if (!event) return;
          const id = event.type === "DELETE" ? event.id : event.order.id;
          changedAt.current.set(id, ++eventVersion.current);
          setOrders((prev) => applyRealtimeOrderEvent(prev, event));
          if (event.type === "INSERT") onInsertRef.current?.(event.order);
          onChangeRef.current?.(
            event.type === "DELETE" ? null : event.order.booth_id,
          );
        },
      )
      // Every subscription reconciles, including the SSR-to-hydration gap.
      .subscribe((channelStatus) => {
        if (channelStatus === "SUBSCRIBED") {
          setStatus("connected");
          void resync();
        } else if (
          channelStatus === "CHANNEL_ERROR" ||
          channelStatus === "TIMED_OUT" ||
          channelStatus === "CLOSED"
        ) {
          setStatus("disconnected");
          console.warn("useRealtimeOrders channel status:", channelStatus);
        }
      });

    return () => {
      requests.current++;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the supabase client and setOrders are stable; only the booth filter re-subscribes
  }, [filterString]);

  return { orders, status };
}
