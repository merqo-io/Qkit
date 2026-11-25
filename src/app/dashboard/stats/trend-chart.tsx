"use client";

import { formatMoney } from "@merqo/ui";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDay } from "@/lib/tz";
import type { SeriesPoint } from "@/lib/stats";
import { RANGE_LABEL } from "./chart-format";

// Abbreviate the Y axis: "$8" / "$1.2k". Full precision lives in the tooltip.
function shortMoney(cents: number): string {
  const dollars = cents / 100;
  return dollars >= 1000
    ? `$${(dollars / 1000).toFixed(1)}k`
    : `$${Math.round(dollars)}`;
}

function ordersOf(payload: unknown): number {
  return (payload as { orders?: number } | null)?.orders ?? 0;
}

/**
 * Revenue trend across the window — shape of growth, not just the delta. The
 * `title` defaults to "Revenue trend" (the vendor's own sales); the admin view
 * passes a clearer label since there it's aggregate booth sales (GMV), not qkit's
 * own earnings.
 */
export function TrendChart({
  series,
  range,
  title = "Revenue trend",
}: {
  series: SeriesPoint[];
  range: string;
  title?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}{" "}
        <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
          · {RANGE_LABEL[range] ?? range}
        </span>
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart
          data={series}
          margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            interval="preserveStartEnd"
            tickFormatter={(t) => shortDay(Number(t))}
          />
          <YAxis
            width={44}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => shortMoney(Number(v))}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border)" }}
            formatter={(value, _name, item) => [
              `${formatMoney(Number(value))} · ${ordersOf(item?.payload)} orders`,
              "",
            ]}
            labelFormatter={(label) => shortDay(Number(label))}
          />
          <Area
            type="monotone"
            dataKey="revenue_cents"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#revFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
