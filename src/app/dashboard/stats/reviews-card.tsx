"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { shortDateTime } from "@/lib/tz";
import type { BoothReviews, ReviewSummary } from "@/lib/reviews";
import { EYEBROW_CLASS } from "@/lib/utils";

const PAGE = 5;

// Stands in for a booth with no reviews yet, so BoothDetail always has a
// summary to render.
const empty: ReviewSummary = {
  count: 0,
  average: null,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  recent: [],
};

// Renders fractional stars: 4.5 → four full + one half (not rounded up to 5).
function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }, (_, i) => {
        // 0..1 for this star
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block">
            <Star className="size-3.5 text-muted-foreground/30" />
            {fill > 0 && (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star className="size-3.5 fill-primary text-primary" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function Distribution({ summary }: { summary: ReviewSummary }) {
  const { count, distribution } = summary;
  if (count === 0) return null;
  return (
    <div className="space-y-1">
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const n = distribution[star];
        const pct = Math.round((n / count) * 100);
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-muted-foreground">{star}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-right text-muted-foreground">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Detailed reviews for one booth: distribution + paged, timestamped comments. */
function BoothDetail({ summary }: { summary: ReviewSummary }) {
  const [shown, setShown] = useState(PAGE);
  const comments = summary.recent.filter((r) => r.message?.trim());
  const visible = comments.slice(0, shown);

  if (summary.count === 0 && comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reviews for this booth yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl font-semibold leading-none">
          {summary.average?.toFixed(1) ?? "-"}
        </span>
        <div>
          <Stars value={summary.average ?? 0} />
          <p className="text-xs text-muted-foreground">
            {summary.count} rating{summary.count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <Distribution summary={summary} />

      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((r, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-background p-3 text-sm"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                {r.rating !== null && r.rating !== undefined ? (
                  <Stars value={r.rating} />
                ) : (
                  <span />
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {shortDateTime(r.created_at)}
                </span>
              </div>
              {r.message && <p className="whitespace-pre-line">{r.message}</p>}
            </li>
          ))}
        </ul>
      )}

      {(shown < comments.length || shown > PAGE) && (
        <div className="flex gap-4 text-xs font-medium">
          {shown < comments.length && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE)}
              className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
            >
              Show more ({comments.length - shown})
            </button>
          )}
          {shown > PAGE && (
            <button
              type="button"
              onClick={() => setShown(PAGE)}
              className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
            >
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  groups: BoothReviews[];
  overall: ReviewSummary;
  // "all" or a booth id (follows the page's booth filter)
  selected: string;
  // preserved on drill-in links
  range?: string;
  // per-booth rows link to that booth (off in event view)
  linkable?: boolean;
}

/** "All booths" body: the overall rollup plus a per-booth comparison list. */
function AllBoothsRollup({
  groups,
  overall,
  range,
  linkable,
}: Pick<Props, "groups" | "overall" | "range"> & { linkable: boolean }) {
  return (
    <>
      {/* Overall rollup across every booth. */}
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl font-semibold leading-none">
          {overall.average?.toFixed(1) ?? "-"}
        </span>
        <div>
          <Stars value={overall.average ?? 0} />
          <p className="text-xs text-muted-foreground">
            {overall.count} rating{overall.count === 1 ? "" : "s"} across all
            booths
          </p>
        </div>
      </div>

      {/* Per-booth comparison — spot the strong and weak booths. */}
      <ul className="divide-y divide-border/60">
        {groups.map((g) => {
          const inner = (
            <span className="flex items-center justify-between gap-3 py-2">
              <span className="truncate text-sm font-medium">
                {g.boothName}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm">
                <span className="font-semibold">
                  {g.summary.average?.toFixed(1) ?? "-"}
                </span>
                <Stars value={g.summary.average ?? 0} />
                <span className="text-muted-foreground">
                  ({g.summary.count})
                </span>
              </span>
            </span>
          );
          return (
            <li key={g.boothId}>
              {linkable ? (
                <Link
                  href={`/dashboard/stats?booth=${g.boothId}${
                    range ? `&range=${range}` : ""
                  }`}
                  className="block rounded-lg px-1 transition-colors hover:bg-accent"
                >
                  {inner}
                </Link>
              ) : (
                <div className="px-1">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Customer reviews driven by the page's booth selector.
 * - A specific booth → that booth's detailed reviews.
 * - "All booths" → the overall average plus a per-booth comparison (drill in by
 *   picking a booth). Mirrors multi-location review dashboards: aggregate rollup
 *   + per-location detail.
 */
export function ReviewsCard({
  groups,
  overall,
  selected,
  range,
  linkable = true,
}: Props) {
  const title =
    selected === "all" ? "Customer reviews · all booths" : "Customer reviews";

  let body: ReactNode;
  if (selected !== "all") {
    body = (
      <BoothDetail
        summary={groups.find((g) => g.boothId === selected)?.summary ?? empty}
      />
    );
  } else if (groups.length === 0) {
    body = (
      <p className="text-sm text-muted-foreground">
        No customer feedback yet. Customers get a prompt after each order.
      </p>
    );
  } else {
    body = (
      <AllBoothsRollup
        groups={groups}
        overall={overall}
        range={range}
        linkable={linkable}
      />
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className={EYEBROW_CLASS}>{title}</h2>
      {body}
    </section>
  );
}
