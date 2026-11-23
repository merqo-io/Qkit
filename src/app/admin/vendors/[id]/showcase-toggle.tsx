"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label, Switch } from "@merqo/ui/primitives";

import { setVendorShowcase } from "../../actions";

/**
 * Admin switch for listing a vendor in the landing page's "Vendors on qkit"
 * showcase. Saves on change and rolls back the switch if the save fails.
 */
export function ShowcaseToggle({
  vendorId,
  initial,
}: {
  vendorId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(initial);

  function onChange(next: boolean) {
    setOn(next);
    startTransition(async () => {
      const res = await setVendorShowcase({ id: vendorId, show: next });
      if (!res.success) {
        setOn(!next);
        toast.error(res.error);
        return;
      }
      toast.success(
        next ? "Shown on the landing page" : "Hidden from the landing page",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex min-h-11 items-center gap-3">
        <Switch
          id="showcase-on-landing"
          checked={on}
          disabled={pending}
          onCheckedChange={onChange}
        />
        <Label htmlFor="showcase-on-landing" className="text-sm font-medium">
          Show on landing page
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Lists this vendor&apos;s profile name and picture under &quot;Vendors on
        qkit&quot;. Get the vendor&apos;s permission first.
      </p>
    </div>
  );
}
