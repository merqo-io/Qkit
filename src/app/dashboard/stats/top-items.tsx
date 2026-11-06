"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl } from "@merqo/ui";
import { formatPrice } from "@/lib/utils";
import type { TopItem } from "@/lib/stats";

type Metric = "quantity" | "revenue_cents";

const METRICS: { value: Metric; label: string }[] = [
  { value: "quantity", label: "By volume" },
  { value: "revenue_cents", label: "By revenue" },
];

function revenueCents(payload: unknown): number {
  return (payload as { revenue_cents?: number } | null)?.revenue_cents ?? 0;
}

export function TopItems({
  items,
  limit = 8,
}: {
  items: TopItem[];
  limit?: number;
}) {
  const [metric, setMetric] = useState<Metric>("quantity");
  // Rank by the CHOSEN metric first, THEN take the top-N. `items` is the full
  // aggregation from computeStats, so switching to "By revenue" can surface a
  // high-revenue item a quantity-only pre-slice would hide.
  const ranked =
    metric === "revenue_cents"
      ? [...items].sort((a, b) => b.revenue_cents - a.revenue_cents)
      : [...items].sort((a, b) => b.quantity - a.quantity);
  const data = ranked.slice(0, limit);
  const chartHeight = Math.max(140, data.length * 44);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Top items
        </p>
        <SegmentedControl
          ariaLabel="Rank top items by"
          size="sm"
          options={METRICS}
          value={metric}
          onChange={setMetric}
        />
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 8, right: 16, top: 0, bottom: 0 }}
        >
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
            formatter={(value, _name, item) => [
              `${item?.payload?.quantity ?? value} sold · ${formatPrice(revenueCents(item?.payload))}`,
              "",
            ]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey={metric} radius={[0, 6, 6, 0]}>
            {data.map((t) => (
              <Cell key={t.label} fill="var(--color-primary)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
