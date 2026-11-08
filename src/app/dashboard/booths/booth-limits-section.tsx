"use client";

import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/widgets/ticket-section";
import { ProLock } from "@/components/widgets/pro-lock";
import type { Entitlement } from "@/lib/plan";
import { SettingRow } from "./setting-row";
import { StartServiceButton } from "../start-service-button";

// A blank number field means "no limit", sent as null (the same convention as
// board_settings.default_prep_minutes in the dashboard settings form).
export function limitOrNull(text: string): number | null {
  return text.trim() === "" ? null : Number(text.trim());
}

function LimitField({
  id,
  label,
  hint,
  hintLabel,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  hintLabel: string;
  max: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingRow label={label} hint={hint} hintLabel={hintLabel} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        placeholder="No limit"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-28 rounded-lg"
      />
    </SettingRow>
  );
}

const DAILY_LIMIT_LABEL = "Daily item limit";
const DAILY_LIMIT_HINT_LABEL = "About the daily item limit";
const DAILY_LIMIT_HINT =
  "Ordering stops once the booth sells this many items in a day. Counts every item, so an order of four counts four. Leave blank for no limit. It starts again from zero at midnight, or sooner when you tap Start new service, so a morning and an afternoon service can each take the full limit.";

// The daily limit on a plan without stock caps. With none set it is an
// upgrade prompt. With one already set (from a pass that has since ended) it
// keeps working, and the vendor can see it and take it off, but not change it.
function LockedDailyLimit({
  value,
  onRemove,
}: {
  value: string;
  onRemove: () => void;
}) {
  if (value === "")
    return (
      <SettingRow
        label={DAILY_LIMIT_LABEL}
        hint={DAILY_LIMIT_HINT}
        hintLabel={DAILY_LIMIT_HINT_LABEL}
      >
        <ProLock feature="stock_cap" label="Starter" />
      </SettingRow>
    );
  return (
    <SettingRow
      label={DAILY_LIMIT_LABEL}
      hint="It keeps working until you remove it. Changing it needs the Starter plan or higher."
      hintLabel={DAILY_LIMIT_HINT_LABEL}
    >
      <span className="text-sm text-muted-foreground">Set to {value}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-lg"
        onClick={onRemove}
      >
        Remove limit
      </Button>
    </SettingRow>
  );
}

interface Props {
  entitlement: Entitlement;
  dailyCupCap: string;
  onDailyCupCapChange: (value: string) => void;
  maxItemsPerOrder: string;
  onMaxItemsPerOrderChange: (value: string) => void;
  boothId?: string;
  boothName?: string;
  savedDailyCupCap?: number | null;
}

export function BoothLimitsSection({
  entitlement,
  dailyCupCap,
  onDailyCupCapChange,
  maxItemsPerOrder,
  onMaxItemsPerOrderChange,
  boothId,
  boothName,
  savedDailyCupCap,
}: Props) {
  return (
    <Section
      icon={<Gauge className="size-5" />}
      eyebrow="How much you take"
      title="Limits"
      description="Cap what one day or one order can take."
    >
      {entitlement.stockCaps ? (
        <LimitField
          id="daily-cup-cap"
          label={DAILY_LIMIT_LABEL}
          hint={DAILY_LIMIT_HINT}
          hintLabel={DAILY_LIMIT_HINT_LABEL}
          max={100000}
          value={dailyCupCap}
          onChange={onDailyCupCapChange}
        />
      ) : (
        <LockedDailyLimit
          value={dailyCupCap}
          onRemove={() => onDailyCupCapChange("")}
        />
      )}

      {/* Keyed on the saved limit, not the field: a limit typed but not
          yet saved has no count behind it to reset. */}
      {boothId &&
        savedDailyCupCap !== null &&
        savedDailyCupCap !== undefined && (
          <div className="flex justify-end">
            <StartServiceButton boothId={boothId} boothName={boothName ?? ""} />
          </div>
        )}

      <LimitField
        id="max-items-per-order"
        label="Max items per order"
        hint="Stops one customer taking the whole tray. Orders you key in yourself are not limited. Leave blank for no limit."
        hintLabel="About the per-order item limit"
        max={100}
        value={maxItemsPerOrder}
        onChange={onMaxItemsPerOrderChange}
      />
    </Section>
  );
}
