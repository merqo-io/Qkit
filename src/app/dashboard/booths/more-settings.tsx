"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { ChevronDown } from "lucide-react";

/** The edit page's collapsed disclosure for everything beyond the short top block. */
export function MoreSettings({
  open,
  onToggle,
  panelRef,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-border bg-card px-6 py-3 text-left text-base font-semibold hover:border-primary/40"
      >
        More settings
        <ChevronDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div id={panelId} ref={panelRef} hidden={!open}>
        {children}
      </div>
    </>
  );
}
