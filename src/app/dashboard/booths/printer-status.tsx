"use client";

import { StatusBadge } from "@merqo/ui";
import type { PrinterStatusView } from "@/hooks/use-printer-status";

type PrinterPresence = "online" | "offline";

const STATUS_CONFIG: Record<
  PrinterPresence,
  { label: string; className: string }
> = {
  online: {
    label: "Printer connected",
    className: "text-status-ready border-status-ready/35 bg-status-ready/12",
  },
  offline: {
    label: "Printer offline",
    className:
      "text-status-cancelled border-status-cancelled/35 bg-status-cancelled/12",
  },
};

// Presentational only -- printing-section.tsx owns the status polling.
export function PrinterStatus({ view }: { view: PrinterStatusView }) {
  if (view.kind === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking the printer...
      </p>
    );
  }

  if (view.kind === "unreachable") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Can&apos;t reach printkit right now. Orders still print once it&apos;s
        back.
      </p>
    );
  }

  if (view.kind === "unconfigured") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Printing isn&apos;t configured yet.
      </p>
    );
  }

  if (view.kind === "none") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No printer set up for this booth yet.
      </p>
    );
  }

  const online = view.printer.state === "online";

  return (
    <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
      <StatusBadge
        status={online ? "online" : "offline"}
        config={STATUS_CONFIG}
      />
      <span className="text-muted-foreground">{view.printer.displayName}</span>
      {!online && (
        <span className="text-muted-foreground">
          Switch it on, or open printkit to check it
        </span>
      )}
    </div>
  );
}
