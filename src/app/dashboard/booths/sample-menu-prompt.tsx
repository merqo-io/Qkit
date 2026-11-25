"use client";

import { Button } from "@merqo/ui/primitives";
import { toast } from "sonner";

import { useAsyncAction } from "@/hooks/use-async-action";
import type { MenuItemFormInput } from "@/lib/schemas";
import { seedSampleMenu } from "./seed-sample-menu";

interface Props {
  boothId: string;
  disabled?: boolean;
  onAdded: (items: MenuItemFormInput[]) => void;
}

/**
 * The empty-menu shortcut: one tap adds three editable drinks so a new vendor
 * has something to order from within a minute. It is never applied silently,
 * so sample items can't reach customers without the vendor choosing them.
 */
export function SampleMenuPrompt({
  boothId,
  disabled = false,
  onAdded,
}: Props) {
  const { pending, run } = useAsyncAction("Could not add the sample menu");

  function onTap() {
    void run(async () => {
      const result = await seedSampleMenu(boothId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onAdded(result.items);
    });
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card px-6 py-6 text-center">
      <Button
        type="button"
        size="lg"
        className="h-12 w-full rounded-xl text-base font-semibold sm:w-auto"
        disabled={disabled || pending}
        onClick={onTap}
      >
        {pending ? "Adding…" : "Start with a sample menu"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Three drinks to start. Change names and prices, or delete them.
      </p>
    </div>
  );
}
