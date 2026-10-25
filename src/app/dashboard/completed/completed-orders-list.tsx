"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { OrderCard } from "@/components/board/order-card";
import { displayOrderNumber } from "@/lib/orders";
import { Ticket } from "@/components/widgets/ticket";
import { Paginated } from "@/components/widgets/paginated";
import { SegmentedControl } from "@/components/widgets/segmented-control";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardOrder } from "@/lib/types";

interface Booth {
  id: string;
  name: string;
}

type DateRange = "today" | "7d" | "30d" | "all";

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

// Ms since the range's cutoff, or null for "all" (no filtering). "today"
// uses `todayStartIso` — computed once, server-side, via sgtStartOfDayIso —
// rather than a client-local `new Date()`: the server likely runs UTC while
// a vendor's browser runs SGT (or whatever their device is set to), so an
// independently-recomputed local midnight would put the boundary up to 8
// hours apart between server and client, changing which orders match and
// causing a real hydration mismatch (not just a millisecond edge case) now
// that "today" is the default render instead of an opt-in click. "7d"/"30d"
// stay locally computed — safe, since they're never the initial state, only
// reached after a vendor's own post-hydration click.
function rangeCutoffMs(range: DateRange, todayStartIso: string): number | null {
  if (range === "all") return null;
  if (range === "today") return Date.parse(todayStartIso);
  const days = range === "7d" ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export function CompletedOrdersList({
  booths,
  orders,
  loadError,
  historyLimit,
  todayStartIso,
  dailyOrderNumberBaselines = {},
}: {
  booths: Booth[];
  orders: BoardOrder[];
  loadError: boolean;
  historyLimit: number;
  todayStartIso: string;
  // Each booth's first order number of the SGT day, when the vendor numbers
  // from 1 each day. Empty otherwise.
  dailyOrderNumberBaselines?: Record<string, string>;
}) {
  const boothName = new Map(booths.map((b) => [b.id, b.name]));
  const multiBooth = booths.length > 1;
  const [boothFilter, setBoothFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("today");

  // Today's tickets carry the number the board showed for them. An earlier
  // day's baseline is not loaded, and a daily number repeats across days, so
  // older tickets keep their permanent number.
  const todayStartMs = Date.parse(todayStartIso);
  function shownNumber(o: BoardOrder): string | undefined {
    const baseline = dailyOrderNumberBaselines[o.booth_id];
    if (
      o.order_number === null ||
      o.order_number === undefined ||
      baseline === undefined
    )
      return undefined;
    if (Date.parse(o.created_at) < todayStartMs) return undefined;
    return displayOrderNumber(o.order_number, baseline);
  }

  const cutoffMs = rangeCutoffMs(dateRange, todayStartIso);
  const filtered = orders.filter((o) => {
    if (boothFilter !== "all" && o.booth_id !== boothFilter) return false;
    if (cutoffMs !== null) {
      const completedMs = Date.parse(o.completed_at ?? o.created_at);
      if (completedMs < cutoffMs) return false;
    }
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      (o.order_number?.toLowerCase().includes(q) ?? false) ||
      (shownNumber(o)?.includes(q) ?? false) ||
      o.customer_name.toLowerCase().includes(q)
    );
  });

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
      >
        Couldn&apos;t load your completed orders. Refresh to try again.
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Ticket shadow="none" dashed className="mt-10 py-20 text-center">
        <p className="font-display text-2xl font-semibold">
          No completed orders yet
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders you mark picked up show up here.
        </p>
      </Ticket>
    );
  }

  return (
    <div>
      {orders.length === historyLimit && (
        <p className="mb-4 text-xs text-muted-foreground">
          Showing your most recent {historyLimit} completed orders.
        </p>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Date range"
          options={DATE_RANGES}
          value={dateRange}
          onChange={setDateRange}
        />
        {multiBooth && (
          <Select value={boothFilter} onValueChange={setBoothFilter}>
            <SelectTrigger
              aria-label="Filter by booth"
              className="h-9 rounded-lg text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All booths</SelectItem>
              {booths.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order # or customer name"
            className="h-9 rounded-lg pl-9"
            aria-label="Search completed orders"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Ticket shadow="none" dashed className="mt-4 py-16 text-center">
          <p className="font-display text-xl font-semibold">
            No matching orders
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different order number, name, booth, or date range.
          </p>
        </Ticket>
      ) : (
        <Paginated
          pageSize={12}
          alwaysShowCount
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              boothName={multiBooth ? boothName.get(order.booth_id) : undefined}
              showDate
              displayNumber={shownNumber(order)}
            />
          ))}
        </Paginated>
      )}
    </div>
  );
}
