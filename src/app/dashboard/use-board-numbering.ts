"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
} from "react";
import { sgtStartOfDayIso } from "@/lib/tz";
import {
  accumulateBaseline,
  baselineFor,
  emptyServices,
  type NumberingBaselines,
} from "@/lib/numbering-baselines";
import { displayOrderNumber } from "@/lib/orders";
import { isNil } from "@/lib/utils";
import type { BoardOrder, BoardSettings } from "@/lib/types";

type Baselines = Record<string, NumberingBaselines>;

// The SGT day the numbering ranks within, advanced by a timer at midnight so
// a board left open overnight starts the new day at #001 without a reload.
// The extra second keeps a timer that fires a hair early from re-reading the
// old day and never scheduling again.
function useDayStart() {
  const [dayStartIso, setDayStartIso] = useState(() => sgtStartOfDayIso());
  useEffect(() => {
    const nextMidnight = Date.parse(dayStartIso) + 24 * 60 * 60 * 1000;
    const timer = setTimeout(
      () => setDayStartIso(sgtStartOfDayIso()),
      Math.max(nextMidnight - Date.now(), 0) + 1000,
    );
    return () => clearTimeout(timer);
  }, [dayStartIso]);
  return dayStartIso;
}

// Restarts the vendor just made, ahead of the page refresh that carries them
// in serviceStarts. Without them an order arriving in that gap would still
// rank from the old service.
function useLocalServiceStarts() {
  const [localStarts, setLocalStarts] = useState<Record<string, string[]>>({});
  const recordServiceStart = useCallback(
    (boothId: string, startedAt: string) =>
      setLocalStarts((prev) => ({
        ...prev,
        [boothId]: [...(prev[boothId] ?? []), startedAt],
      })),
    [],
  );
  return { localStarts, recordServiceStart };
}

interface BaselineInputs {
  orders: BoardOrder[];
  dayStartIso: string;
  baselinesDayStart?: string;
  serviceStarts: Record<string, string[]>;
  localStarts: Record<string, string[]>;
  serverBaselines: Baselines;
}

function serviceWindowsFor(
  inputs: BaselineInputs,
  boothId: string,
  server?: NumberingBaselines,
) {
  const dayStart = Date.parse(inputs.dayStartIso);
  return emptyServices(
    [
      ...(inputs.serviceStarts[boothId] ?? []),
      ...(inputs.localStarts[boothId] ?? []),
      ...(server?.services.map((s) => s.start) ?? []),
    ].filter((s) => Date.parse(s) >= dayStart),
  );
}

// Only today's orders count, the same SGT window the server query uses. An
// order still in progress from an earlier day would otherwise become the
// baseline and rebase itself to #001, while the customer's status page, the
// TV display and the printed label all still show its permanent number.
function baselinesFromOrders(inputs: BaselineInputs) {
  const merged: Baselines = {};
  const dayStart = Date.parse(inputs.dayStartIso);
  for (const o of inputs.orders) {
    if (isNil(o.order_number)) continue;
    if (Date.parse(o.created_at) < dayStart) continue;
    const entry = (merged[o.booth_id] ??= {
      day: null,
      services: serviceWindowsFor(inputs, o.booth_id),
    });
    accumulateBaseline(entry, o.order_number, o.created_at);
  }
  return merged;
}

function mergeServerBaselines(inputs: BaselineInputs, merged: Baselines) {
  for (const [boothId, server] of Object.entries(inputs.serverBaselines)) {
    const seen = merged[boothId];
    merged[boothId] = {
      day: server.day ?? seen?.day ?? null,
      services: serviceWindowsFor(inputs, boothId, server).map((s) => ({
        start: s.start,
        baseline:
          server.services.find((x) => x.start === s.start)?.baseline ??
          seen?.services.find((x) => x.start === s.start)?.baseline ??
          null,
      })),
    };
  }
  return merged;
}

function computeBaselines(inputs: BaselineInputs) {
  const merged = baselinesFromOrders(inputs);
  const serverUsable =
    inputs.baselinesDayStart === undefined ||
    Date.parse(inputs.baselinesDayStart) === Date.parse(inputs.dayStartIso);
  return serverUsable ? mergeServerBaselines(inputs, merged) : merged;
}

/**
 * The board's day numbering: the SGT day start, each booth's baselines and the
 * number a just-placed order should be called by.
 *
 * dailyOrderNumberBaselines is each booth's day and service baselines, read
 * once by the server page. It has no entry for a booth that had no order yet
 * when the board was opened, which is the normal case at an event: staff open
 * the board while setting up. Fill those from the lowest order_number this
 * board has seen for the booth since each window opened, so that window is
 * covered too. Without it the whole service runs on permanent numbers (#0847)
 * while the customer's status page, the TV queue display and the printed
 * label each recompute the daily rank (#001) live per request, and staff call
 * a number no customer is holding.
 * Derived from the full `orders` list, not just the cards on screen: a
 * terminal or hidden pending-payment order still counts towards the first
 * number, which is what the server-side query counts too. The list is
 * append-only in practice (useRealtimeOrders merges rather than replaces, and
 * terminal orders are filtered at render), so this does not drift upwards as
 * the day's early orders clear. A realtime DELETE of the first order would
 * move it, which no code path in qkit does.
 */
export function useBoardNumbering({
  orders,
  boardSettings,
  baselinesDayStart,
  serviceStarts,
  dailyOrderNumberBaselines,
  newOrderNumberRef,
}: {
  orders: BoardOrder[];
  boardSettings: BoardSettings;
  baselinesDayStart?: string;
  serviceStarts: Record<string, string[]>;
  dailyOrderNumberBaselines: Baselines;
  newOrderNumberRef: MutableRefObject<
    (boothId: string, orderNumber: string) => string
  >;
}) {
  const dayStartIso = useDayStart();
  const { localStarts, recordServiceStart } = useLocalServiceStarts();
  const resetDaily = boardSettings.daily_order_number_reset;

  const baselinesByBooth = useMemo(
    () =>
      resetDaily
        ? computeBaselines({
            orders,
            dayStartIso,
            baselinesDayStart,
            serviceStarts,
            localStarts,
            serverBaselines: dailyOrderNumberBaselines,
          })
        : ({} as Baselines),
    [
      orders,
      resetDaily,
      dayStartIso,
      baselinesDayStart,
      serviceStarts,
      localStarts,
      dailyOrderNumberBaselines,
    ],
  );

  // Toasts, the desktop notification and the walk-up dialog all name an order
  // the moment it is placed, and used to name it by its permanent number
  // (#0847) while its ticket said #002. An order placed just now with no
  // baseline yet for its booth is the service's first, so it is its own
  // baseline. That shortcut is for a new order only: a ticket carried over from
  // yesterday must keep its permanent number, so the cards do not use it.
  function newOrderNumber(boothId: string, orderNumber: string) {
    const baseline = baselineFor(
      new Date().toISOString(),
      baselinesByBooth[boothId],
      dayStartIso,
    );
    const ownBaseline = resetDaily ? orderNumber : null;
    return displayOrderNumber(orderNumber, baseline ?? ownBaseline);
  }
  useEffect(() => {
    newOrderNumberRef.current = newOrderNumber;
  });

  return { dayStartIso, baselinesByBooth, recordServiceStart, newOrderNumber };
}
