"use client";

import { Ticket } from "lucide-react";
import { Ticket as TicketCard } from "@/components/widgets/ticket";
import { useNow } from "@/hooks/use-now";
import { sgtWeekdayTime } from "@/lib/tz";

function format(msLeft: number): string {
  const totalMin = Math.max(0, Math.floor(msLeft / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

/** Live countdown for an active pass. Ticks each minute. */
export function PassCountdown({ expiresAt }: { expiresAt: string }) {
  // null until mounted (see useNow): the server and first client render both
  // hold the line with a non-breaking space, so SSR text can't drift.
  const nowMs = useNow(60_000);
  const left =
    nowMs === null || nowMs === undefined
      ? null
      : Date.parse(expiresAt) - nowMs;
  // Fixed to SGT so the server and client render the same string (no hydration
  // mismatch), unlike a runtime-tz toLocaleString.
  const until = sgtWeekdayTime(expiresAt);

  return (
    <TicketCard
      shadow="none"
      className="flex items-center gap-3 border-primary/30 bg-primary/5 p-5"
    >
      <Ticket className="size-5 shrink-0 text-primary" />
      <div>
        <p className="font-display text-lg font-semibold text-primary">
          Pro until {until}
        </p>
        <p className="text-sm text-muted-foreground">
          {left === null || left === undefined ? " " : format(left)}
        </p>
      </div>
    </TicketCard>
  );
}
