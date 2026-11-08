"use client";

import { AlertTriangle, Banknote, Clock, Printer } from "lucide-react";
import { OrderStatusBadge } from "@/components/board/order-status-badge";
import { cn, isNil } from "@/lib/utils";
import {
  ageLabel,
  elapsedMinutes,
  orderAgeTone,
  type AgeTone,
} from "@/lib/orders";
import type { TicketAttention } from "@/lib/ticket";
import type { OrderStatus } from "@/lib/types";

const ATTENTION_ICON: Record<TicketAttention["kind"], typeof AlertTriangle> = {
  payment_claimed: Banknote,
  print_failed: Printer,
  overtaken: AlertTriangle,
  unpaid: Banknote,
};

/**
 * Ticket-aging tone + elapsed minutes. `nowMs` is null before mount (see
 * useNow), which yields no label and a "fresh" tone. Pending is pre-arrival
 * (arrival-confirmation booth, customer hasn't tapped "I'm here" yet), so it
 * is forced "fresh" too: nothing is cooking or waiting yet, and a pending
 * order must never get the amber/red wash meant for food getting cold.
 */
export function ticketAge(
  nowMs: number | null,
  order: { createdAt: string; status: OrderStatus },
  thresholds: { agingMin: number | undefined; overdueMin: number | undefined },
): { tone: AgeTone; ageMins: number | null } {
  const { createdAt, status } = order;
  const { agingMin, overdueMin } = thresholds;
  if (isNil(nowMs)) return { tone: "fresh", ageMins: null };
  const elapsedMs = nowMs - Date.parse(createdAt);
  return {
    tone:
      status === "pending"
        ? "fresh"
        : orderAgeTone(elapsedMs, agingMin, overdueMin),
    ageMins: elapsedMinutes(elapsedMs),
  };
}

function ageToneClass(tone: AgeTone): string {
  if (tone === "overdue") return "text-status-cancelled";
  if (tone === "aging") return "text-status-aging";
  return "text-muted-foreground";
}

function ageToneAriaSuffix(tone: AgeTone): string {
  if (tone === "overdue") return ", overdue";
  if (tone === "aging") return ", getting old";
  return "";
}

// The ticket's bottom strip, under the action button and away from the number
// and name, so the top of the ticket carries only what gets read out and the
// "more" menu. Bottom-left is how long the order has waited; bottom-right is
// its status, when it is anything other than the unsaid "Preparing". The time
// is absent before mount (ageMins is null until then, see useNow).
export function TicketFooter({
  ageMins,
  tone,
  status,
  awaitingArrival,
}: {
  ageMins: number | null;
  tone: AgeTone;
  status: OrderStatus;
  awaitingArrival: boolean;
}) {
  const showStatus = status !== "preparing";
  if (isNil(ageMins) && !showStatus) return null;
  // A fixed h-10 with no vertical padding: the "Waiting for you" pill is taller
  // than the timer, so min-h-10 plus py-2 grew an Incoming footer to 44px
  // against an Accepted one's 40px.
  return (
    <div className="flex h-10 items-center justify-between gap-3 border-t border-border/60 px-4">
      {ageMins !== null && ageMins !== undefined ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums",
            ageToneClass(tone),
          )}
          title="Time since the order arrived"
          aria-label={`${ageMins} minutes since arrival${ageToneAriaSuffix(tone)}`}
        >
          {tone === "overdue" ? (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          ) : (
            <Clock className="size-3.5" aria-hidden="true" />
          )}
          {ageLabel(ageMins)}
          {/* A word and its own icon, so a late ticket does not rest on the
              difference between amber and red. */}
          {tone === "overdue" && <span aria-hidden="true">· Late</span>}
        </span>
      ) : (
        <span />
      )}
      {/* One line whatever the column width: a wrapped "Waiting for you"
          would make an Incoming ticket taller than its neighbours. */}
      {showStatus && (
        <span className="shrink-0 whitespace-nowrap">
          <OrderStatusBadge status={status} awaitingArrival={awaitingArrival} />
        </span>
      )}
    </div>
  );
}

// The ticket's single attention line (see ticketAttention): one message, never
// a stack of pills. Filled only for the case that needs the vendor to act; the
// rest sit on a quiet tint so an ordinary rush is not a wall of alarms.
export function AttentionLine({ attention }: { attention: TicketAttention }) {
  const Icon = ATTENTION_ICON[attention.kind];
  return (
    <p
      className={cn(
        "mx-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm leading-tight font-semibold",
        attention.tone === "action"
          ? "bg-status-payment-claimed text-white"
          : "bg-foreground/[0.06] text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {attention.label}
    </p>
  );
}
