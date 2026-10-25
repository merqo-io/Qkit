"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProLock } from "@/components/widgets/pro-lock";
import type { Entitlement } from "@/lib/plan";
import type { WeekdayKey } from "@/lib/tz";
import type { BoothHours, DayWindow } from "@/lib/hours";
import {
  DEFAULT_WINDOW,
  dailyFromWeek,
  dailyHours,
  emptyWeek,
  weekFromDaily,
} from "@/lib/hours-editor";

const DAYS: { key: WeekdayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const timeInputClass =
  "h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function WorkingHoursEditor({
  value,
  onChange,
  entitlement,
}: {
  value: BoothHours;
  onChange: (hours: BoothHours) => void;
  entitlement: Entitlement;
}) {
  const [mode, setMode] = useState<"daily" | "weekly">(value?.mode ?? "daily");
  const [dailyOpen, setDailyOpen] = useState(
    value?.mode === "daily" ? value.open : "",
  );
  const [dailyClose, setDailyClose] = useState(
    value?.mode === "daily" ? value.close : "",
  );
  const [days, setDays] = useState<Record<WeekdayKey, DayWindow | null>>(
    value?.mode === "weekly" ? value.days : emptyWeek(),
  );

  // Scheduled auto-close is Pro/pass. Free booths open/close with the Active
  // toggle only; show a locked card that nudges to the plan page. (After hooks
  // so hook order stays stable across renders.)
  if (!entitlement.autoCloseHours) {
    return (
      <div className="space-y-2">
        <ProLock feature="auto_close_hours" label="Pro" />
        <p className="text-xs text-muted-foreground">
          Schedule open/close times so orders stop automatically, no need to
          pause the booth by hand. Upgrade to set hours.
        </p>
      </div>
    );
  }

  function emitDaily(open: string, close: string) {
    setDailyOpen(open);
    setDailyClose(close);
    onChange(dailyHours(open, close));
  }

  function emitWeek(next: Record<WeekdayKey, DayWindow | null>) {
    setDays(next);
    onChange({ mode: "weekly", days: next });
  }

  function goWeekly() {
    setMode("weekly");
    emitWeek(weekFromDaily(dailyOpen, dailyClose));
  }

  function goDaily() {
    setMode("daily");
    const { open, close } = dailyFromWeek(days, dailyOpen, dailyClose);
    emitDaily(open, close);
  }

  function setDay(key: WeekdayKey, win: DayWindow | null) {
    emitWeek({ ...days, [key]: win });
  }

  return (
    <div className="space-y-3">
      {mode === "daily" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Opens</span>
            <input
              type="time"
              aria-label="Opens"
              value={dailyOpen}
              onChange={(e) => emitDaily(e.target.value, dailyClose)}
              className={timeInputClass}
            />
            <span className="text-muted-foreground">Closes</span>
            <input
              type="time"
              aria-label="Closes"
              value={dailyClose}
              onChange={(e) => emitDaily(dailyOpen, e.target.value)}
              className={timeInputClass}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Leave blank for no time limit. Customers can&apos;t order outside
            these hours. Closing before opening means an overnight window.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={goWeekly}
          >
            Set different hours per day
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const win = days[key];
            const open = win !== null && win !== undefined;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2">
                <label className="flex w-32 items-center gap-2 text-sm">
                  <Checkbox
                    checked={open}
                    onCheckedChange={(checked) =>
                      setDay(key, checked === true ? DEFAULT_WINDOW : null)
                    }
                  />
                  <span className="font-medium">{label}</span>
                </label>
                {open ? (
                  <div className="flex items-center gap-1.5 text-sm">
                    <input
                      type="time"
                      aria-label={`${label} opens`}
                      value={win.open}
                      onChange={(e) =>
                        setDay(key, { open: e.target.value, close: win.close })
                      }
                      className={timeInputClass}
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="time"
                      aria-label={`${label} closes`}
                      value={win.close}
                      onChange={(e) =>
                        setDay(key, { open: win.open, close: e.target.value })
                      }
                      className={timeInputClass}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 rounded-lg"
            onClick={goDaily}
          >
            Use same hours every day
          </Button>
        </div>
      )}
    </div>
  );
}
