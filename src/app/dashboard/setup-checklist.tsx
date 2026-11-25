"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, ChevronDown, Circle } from "lucide-react";
import { Button, cn } from "@merqo/ui/primitives";

import { Hint } from "@/components/widgets/hint";
import {
  NO_FLAGS,
  deriveChecklist,
  type ChecklistBooth,
  type ChecklistFlags,
  type ChecklistItem,
} from "@/lib/setup-checklist";
import {
  readChecklistHidden,
  readSetupFlag,
  subscribeSetupStorage,
  writeChecklistHidden,
  writeSetupFlag,
} from "@/lib/setup-checklist-storage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";

interface Snapshot {
  hidden: boolean;
  flags: ChecklistFlags;
}

function readSnapshot(boothId: string | null): Snapshot {
  return {
    hidden: readChecklistHidden(),
    flags: boothId
      ? {
          paymentSkipped: readSetupFlag("payment-skipped", boothId),
          qrViewed: readSetupFlag("qr-viewed", boothId),
          tvOpened: readSetupFlag("tv-opened", boothId),
        }
      : NO_FLAGS,
  };
}

/**
 * The browser-only facts as a string so useSyncExternalStore can compare
 * snapshots by value. The server snapshot is null, which renders nothing, so
 * the first client render matches the server one.
 */
function useStoredSetup(boothId: string | null): Snapshot | null {
  const raw = useSyncExternalStore(
    subscribeSetupStorage,
    () => JSON.stringify(readSnapshot(boothId)),
    () => null,
  );
  return raw === null ? null : (JSON.parse(raw) as Snapshot);
}

function StepAction({ item }: { item: ChecklistItem }) {
  if (!item.href) return null;
  return (
    <Button asChild size="sm" className={cn("rounded-lg", TOUCH)}>
      <Link href={item.href}>{item.label}</Link>
    </Button>
  );
}

function SkipPayment({ onSkip }: { onSkip: () => void }) {
  return (
    <span className="inline-flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("rounded-lg", TOUCH)}
        onClick={onSkip}
      >
        Skip, take payment at the counter
      </Button>
      <Hint label="About skipping payment">
        Customers can still order, but they cannot pay through qkit. You collect
        payment in person. You can set up payment later from the booth page.
      </Hint>
    </span>
  );
}

function ItemRow({
  item,
  onSkipPayment,
}: {
  item: ChecklistItem;
  onSkipPayment: () => void;
}) {
  const Icon = item.done ? Check : Circle;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          item.done ? "text-success" : "text-muted-foreground",
        )}
      />
      <span className="sr-only">{item.done ? "Done:" : "To do:"}</span>
      {item.href && !item.done ? (
        <Link
          href={item.href}
          className={cn(
            "text-sm font-medium underline-offset-2 hover:underline",
            TOUCH,
            "inline-flex items-center",
          )}
        >
          {item.label}
        </Link>
      ) : (
        <span
          className={cn(
            "text-sm",
            item.done ? "text-muted-foreground line-through" : "font-medium",
          )}
        >
          {item.label}
        </span>
      )}
      {item.optional ? (
        <span className="text-xs text-muted-foreground">Optional</span>
      ) : null}
      {item.key === "payment" && !item.done ? (
        <SkipPayment onSkip={onSkipPayment} />
      ) : null}
    </li>
  );
}

/**
 * The vendor's way back into setup: every step, which are done, and a link to
 * the next one. Browser-only facts (QR page seen, payment skipped, hidden) are
 * read after mount so the server render and first client render agree.
 */
export function SetupChecklist({
  booth,
  hasOrders,
}: {
  booth: ChecklistBooth | null;
  hasOrders: boolean;
}) {
  const boothId = booth?.id ?? null;
  const [expanded, setExpanded] = useState(false);
  const stored = useStoredSetup(boothId);

  if (!stored || stored.hidden) return null;

  const state = deriveChecklist({ booth, hasOrders, flags: stored.flags });
  if (state.allRequiredDone) return null;

  const noBooth = booth === null;
  const open = noBooth || expanded;
  const skipPayment = () => {
    if (!boothId) return;
    writeSetupFlag("payment-skipped", boothId);
  };

  return (
    <section
      aria-label="Setup checklist"
      className="mb-5 rounded-xl border border-border bg-card px-4 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold">
          Setup: {state.requiredDone} of {state.requiredTotal} done
        </p>
        {!noBooth && state.next ? (
          <>
            <span className="text-sm text-muted-foreground">
              Next: {state.next.detail}
            </span>
            <StepAction item={state.next} />
            {state.next.key === "payment" ? (
              <SkipPayment onSkip={skipPayment} />
            ) : null}
          </>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          {noBooth ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("rounded-lg", TOUCH)}
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Fewer steps" : "All steps"}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("rounded-lg", TOUCH)}
            onClick={writeChecklistHidden}
          >
            Hide
          </Button>
        </span>
      </div>
      {open ? (
        <ol className="mt-1.5 border-t border-border pt-1.5">
          {state.items.map((item) => (
            <ItemRow key={item.key} item={item} onSkipPayment={skipPayment} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}
