"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { boothDotTitle } from "@/lib/booth/color";
import { cn, isNil } from "@/lib/utils";
import { StartServiceButton } from "./start-service-button";

export type BoothView = {
  id: string;
  name: string;
  is_active: boolean;
  open: boolean;
  // Event-mode setup (migration 0080) — optional so existing test fixtures
  // and call sites need no changes; a booth without it behaves exactly as
  // before (never auto-opens the walk-up dialog).
  walkup_default?: boolean;
  // The booth waits for the customer's "I'm here" before an order is made.
  // Optional for the same reason; without it the booth is treated as not
  // waiting.
  requires_arrival_confirm?: boolean;
  // Daily cup cap (booths.daily_cup_cap, migration 0094) and the cups already
  // committed today, both optional: a booth with no cap, and every existing
  // test fixture and call site, simply shows no cup counter.
  daily_cup_cap?: number | null;
  cups_today?: number;
};

export type BoothFilter = "all" | string;

// One booth's open/paused toggle — a single button, not a two-segment
// control: this is fundamentally one binary action (pause it / resume it),
// and a segmented Open|Paused control cost 2-3x the width to say so. Icon
// alone (a first pass) turned out to be a step too far — without hover on a
// phone, an icon-only Pause/Play read as ambiguous. Icon + the current
// state's own word fixes that at a fraction of the segmented control's
// width. Same play/pause convention as a media player: showing Pause means
// "this is running, tap to stop it"; Play means the reverse. Color still
// carries the state too (emerald = open), so nothing rests on any one cue.
export function BoothToggle({
  active,
  onChange,
  boothName,
}: {
  active: boolean;
  onChange: (next: boolean) => void;
  boothName: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange(!active)}
          aria-label={
            active
              ? `${boothName} is open. Tap to pause.`
              : `${boothName} is paused. Tap to resume.`
          }
          className={cn(
            "h-8 shrink-0 gap-1.5 rounded-full px-2.5 text-xs font-semibold",
            active
              ? "border-success/40 bg-success/10 text-success hover:bg-success/15 hover:text-success"
              : "text-muted-foreground",
          )}
        >
          {active ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
          {active ? "Open" : "Paused"}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {active ? "Pause taking orders" : "Resume taking orders"}
      </TooltipContent>
    </Tooltip>
  );
}

// Items committed today against the booth's own cap, for a stall working to
// a fixed stock ("200, then we stop"). Counts items, not orders, matching the
// orders_daily_cup_cap trigger, since one order can carry four or five.
// Amber inside the last CUP_WARN_FRACTION of the cap, so staff see the line
// coming while there is still time to tell the queue. Renders nothing for a
// booth with no cap, which is every booth by default.
const CUP_WARN_FRACTION = 0.1;

function CupCount({ cap, used }: { cap?: number | null; used?: number }) {
  if (isNil(cap)) return null;
  const served = used ?? 0;
  const low = cap - served <= Math.ceil(cap * CUP_WARN_FRACTION);
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-xs",
        low ? "font-semibold text-status-aging" : "text-muted-foreground",
      )}
    >
      {served}/{cap} items
    </span>
  );
}

// One booth's row — shared between the solo inline case (a single-booth
// vendor, no need for a modal over one toggle) and the multi-booth status
// dialog below. The header's own compact case (a booth already selected via
// the board's filter dropdown) skips this row entirely and renders
// BoothToggle directly — the dropdown right below already says which booth
// this is, so a bordered pill wrapping just the (already-bordered) toggle
// button would be a border around a border for no reason.
export function BoothRow({
  b,
  color,
  showDot,
  active,
  onToggle,
}: {
  b: BoothView;
  // From the board's boothColors(), so it matches the tickets and the filter.
  color?: string;
  showDot: boolean;
  active: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      {showDot && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          title={boothDotTitle(b.name)}
        />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
      <CupCount cap={b.daily_cup_cap} used={b.cups_today} />
      {/* Only a booth with a daily limit has a count to reset. */}
      {b.daily_cup_cap !== null && b.daily_cup_cap !== undefined && (
        <StartServiceButton boothId={b.id} boothName={b.name} compact />
      )}
      {/* Manually active but outside scheduled hours: customers still see
          it closed. A distinct state from the toggle itself, worth
          surfacing so the vendor isn't confused about why orders still
          aren't landing. */}
      {active && !b.open && (
        <span className="shrink-0 text-xs text-muted-foreground">
          (outside hours)
        </span>
      )}
      <BoothToggle active={active} onChange={onToggle} boothName={b.name} />
    </div>
  );
}

/**
 * Which booth tab is showing right now, and which single booth (if any) the
 * header's own toggle should control directly instead of opening a dialog.
 * A booth's tab shows only if it's active, still has orders in flight, or is
 * the one the vendor has the board filtered to right now — a turned-off
 * booth with a queue stays until it clears, then self-removes. That last
 * clause matters: without it, pausing the booth you're currently filtered to
 * (with nothing in flight) dropped it from this list on the very same
 * render, which collapsed multiBooth to false and yanked both the filter
 * Select and the header's own toggle out from under the tap that just
 * paused it.
 */
export function resolveBoothFilter(
  booths: BoothView[],
  filter: BoothFilter,
  activeCountFor: (id: string) => number,
): {
  visibleBooths: BoothView[];
  multiBooth: boolean;
  effectiveFilter: BoothFilter;
  selectedBooth: BoothView | undefined;
} {
  const visibleBooths = booths.filter(
    (b) => b.is_active || activeCountFor(b.id) > 0 || b.id === filter,
  );
  const multiBooth = visibleBooths.length > 1;

  // If the selected booth's tab vanished, fall back to All.
  const effectiveFilter: BoothFilter =
    filter !== "all" && !visibleBooths.some((b) => b.id === filter)
      ? "all"
      : filter;
  // A vendor who's already filtered the board down to one booth doesn't need
  // to open a dialog and find that same booth again just to pause it — the
  // header control becomes that booth's own switch directly.
  const selectedBooth =
    multiBooth && effectiveFilter !== "all"
      ? booths.find((b) => b.id === effectiveFilter)
      : undefined;

  return { visibleBooths, multiBooth, effectiveFilter, selectedBooth };
}

/** What the booth filter's trigger reads: the same text as the chosen item. */
export function boothFilterLabel(
  filter: BoothFilter,
  booths: BoothView[],
  total: number,
  countFor: (id: string) => number,
): string {
  const booth = booths.find((b) => b.id === filter);
  if (!booth) return `All booths (${total})`;
  return `${booth.name} (${countFor(booth.id)})${booth.open ? "" : " · closed"}`;
}
