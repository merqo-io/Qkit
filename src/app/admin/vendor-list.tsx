import Link from "next/link";
import { ChevronRight, Ticket } from "lucide-react";
import { EmptyState } from "@merqo/ui";
import { Paginated } from "@/components/widgets/paginated";
import { StatusChip } from "./vendor-status";
import type { VendorStatus } from "@/lib/admin/vendor-health";
import { TIER_LABEL, type Tier } from "@/lib/plan";

export type VendorListItem = {
  id: string;
  name: string;
  tier: Tier;
  created_at: string;
  passHoursLeft: number | null;
  status: VendorStatus;
  orders7d: number;
  lastOrderAt: string | null;
  boothCount: number;
};

/** One labelled figure in a row's stat cluster. */
function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden text-right sm:block">
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/**
 * Vendor triage list — one row per vendor, pre-sorted by urgency on the server.
 * The row is a link into the per-vendor detail page (where the admin acts). The
 * status chip + recency/volume cells do the at-a-glance triage.
 */
export function VendorList({ vendors }: { vendors: VendorListItem[] }) {
  if (vendors.length === 0) {
    return <EmptyState size="compact" title="No vendors yet." />;
  }

  return (
    <Paginated pageSize={15} className="space-y-2">
      {vendors.map((v) => (
        <Link
          key={v.id}
          href={`/admin/vendors/${v.id}`}
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/40"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{v.name}</p>
              <StatusChip status={v.status} />
            </div>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {TIER_LABEL[v.tier]}
              {v.passHoursLeft !== null && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-success">
                  <Ticket className="inline size-3" /> {v.passHoursLeft}h
                </span>
              )}{" "}
              · joined {v.created_at.slice(0, 10)}
            </p>
          </div>
          <Cell label="7d orders" value={String(v.orders7d)} />
          <Cell label="booths" value={String(v.boothCount)} />
          <Cell
            label="last order"
            value={v.lastOrderAt ? v.lastOrderAt.slice(0, 10) : "-"}
          />
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
        </Link>
      ))}
    </Paginated>
  );
}
