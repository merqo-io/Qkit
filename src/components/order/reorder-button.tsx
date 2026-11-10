"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@merqo/ui/primitives";

import { stashReorder } from "@/lib/reorder-handoff";
import type { ReorderLine } from "@/lib/reorder";

interface Props {
  boothId: string;
  lines: ReorderLine[];
  customerName?: string;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}

/**
 * Stash the past order's lines and navigate to the booth menu, where OrderForm
 * reconciles them against the live menu and seeds the cart. Reconciliation is
 * deliberately deferred to the menu page (it has the current menu + stock).
 */
export function ReorderButton({
  boothId,
  lines,
  customerName,
  label = "Reorder",
  size,
  variant = "outline",
  className,
}: Props) {
  const router = useRouter();

  function onClick() {
    stashReorder(boothId, { lines, customerName });
    router.push(`/order/${boothId}`);
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      onClick={onClick}
    >
      <RotateCcw className="size-3.5" />
      {label}
    </Button>
  );
}
