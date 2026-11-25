"use client";

import { Checkbox } from "@merqo/ui/primitives";

import { SocialLinksFields } from "@merqo/ui";
import { Hint } from "@/components/widgets/hint";
import type { SocialLinks } from "@/lib/types";

export function SocialLinksSection({
  value,
  onChange,
  vendorDefaults,
}: {
  value: SocialLinks | null;
  onChange: (next: SocialLinks | null) => void;
  vendorDefaults: SocialLinks;
}) {
  const overridden = value !== null;

  function toggle(checked: boolean) {
    // Seed from the vendor's current defaults so switching an override on
    // doesn't force retyping every link, only the one that differs.
    onChange(checked ? vendorDefaults : null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card px-4 py-3">
        <label className="flex flex-1 items-center gap-3">
          <Checkbox
            checked={overridden}
            onCheckedChange={(checked) => toggle(checked === true)}
          />
          <span className="text-sm">
            <span className="font-medium">Use custom links for this booth</span>
            <span className="block text-muted-foreground">
              Off uses your profile&apos;s default links for every booth.
            </span>
          </span>
        </label>
        <Hint label="About social links">
          Customers see these links on their order status page after they order,
          and on the booth page while you are closed.
        </Hint>
      </div>
      {overridden && (
        <SocialLinksFields
          value={value}
          onChange={onChange}
          idPrefix="booth-social"
        />
      )}
    </div>
  );
}
