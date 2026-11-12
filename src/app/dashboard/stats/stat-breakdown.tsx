"use client";

import {
  cn,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@merqo/ui/primitives";
import { useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { WIDE_ON_PHONE } from "./tile-layout";

export type BreakdownRow = { label: string; value: string };

/**
 * A KPI tile whose value opens a per-item breakdown: on hover for a mouse, on
 * tap for touch (iPad), closing on outside tap. Matches StatTile's look so the
 * strip stays one grid. Falls back to a plain tile when there are no rows.
 */
export function StatBreakdownTile({
  label,
  value,
  caption,
  rows,
  breakdownLabel = "By item",
  deltaSlot,
  primary,
  wide,
  index = 0,
}: {
  label: string;
  value: string;
  caption?: string;
  rows: BreakdownRow[];
  breakdownLabel?: string;
  deltaSlot?: ReactNode;
  primary?: boolean;
  // Takes the whole row on a phone (see WIDE_ON_PHONE).
  wide?: boolean;
  index?: number;
}) {
  const [open, setOpen] = useState(false);
  // pointerType guard: mouse opens on hover, touch/pen on tap. Without it iOS
  // fires a synthetic mouseenter then click on one tap, toggling open-shut.
  const lastPointer = useRef<string>("mouse");
  const hasRows = rows.length > 0;

  function closeOnMouseLeave(pointerType: string) {
    if (pointerType === "mouse") setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse" && hasRows) setOpen(true);
          }}
          onPointerLeave={(e) => closeOnMouseLeave(e.pointerType)}
          onPointerDown={(e) => {
            lastPointer.current = e.pointerType;
          }}
          onClick={() => {
            if (lastPointer.current !== "mouse" && hasRows) setOpen((o) => !o);
          }}
          aria-expanded={hasRows ? open : undefined}
          className={cn(
            "fade-rise flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors",
            primary ? "border-primary/30" : "border-border",
            hasRows ? "hover:border-primary/40" : "cursor-default",
            wide && WIDE_ON_PHONE,
          )}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "text-[0.7rem] font-semibold uppercase tracking-wider",
                primary ? "text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </p>
            <span className="flex items-center gap-1.5">
              {deltaSlot}
              {hasRows && (
                <ChevronDown
                  className={cn(
                    "size-3.5 text-muted-foreground/50 transition-transform",
                    open && "rotate-180",
                  )}
                />
              )}
            </span>
          </div>
          <p className="truncate font-mono text-2xl font-bold leading-none tabular-nums">
            {value}
          </p>
          {caption && (
            <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
              {caption}
            </p>
          )}
        </button>
      </PopoverAnchor>

      {hasRows && (
        <PopoverContent
          align="start"
          sideOffset={6}
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={(e) => closeOnMouseLeave(e.pointerType)}
          className="w-[var(--radix-popper-anchor-width)] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {breakdownLabel}
          </p>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li
                key={r.label}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="truncate text-foreground/80">{r.label}</span>
                <span className="shrink-0 font-mono font-semibold tabular-nums">
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      )}
    </Popover>
  );
}
