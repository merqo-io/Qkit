"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Hourglass, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Section } from "@/components/widgets/ticket-section";
import { InfoTooltip, TwoColumnSections } from "@merqo/ui";
import { useAsyncAction } from "@/hooks/use-async-action";
import { boardSettingsSchema } from "@/lib/schemas";
import { playSound, unlockAudio } from "@/lib/order-alerts";
import { cn, FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";
import type { BoardSettings, SoundId } from "@/lib/types";
import { updateBoardSettings } from "./actions";
import { BackupPrepHelpText, type PrepEstimate } from "./backup-prep-help-text";
import { BoardTimingSection } from "./board-timing-section";
import {
  DesktopNotifySection,
  useDesktopNotifySection,
} from "./desktop-notify-section";
import { saveBoardSettingsSection } from "./save-board-settings-section";

const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "bell", label: "Bell" },
  { id: "ding", label: "Ding" },
  { id: "horn", label: "Horn" },
  { id: "triple", label: "Triple beep" },
  { id: "none", label: "Off" },
];

export function SettingsForm({
  initial,
  prepEstimate,
}: {
  initial: BoardSettings;
  prepEstimate: PrepEstimate;
}) {
  const router = useRouter();
  const [agingMin, setAgingMin] = useState(String(initial.aging_min));
  const [overdueMin, setOverdueMin] = useState(String(initial.overdue_min));
  const [undoSeconds, setUndoSeconds] = useState(String(initial.undo_seconds));
  const [readyAutoClearMin, setReadyAutoClearMin] = useState(
    initial.ready_auto_clear_min !== null &&
      initial.ready_auto_clear_min !== undefined
      ? String(initial.ready_auto_clear_min)
      : "",
  );
  // ?? true, not just the type's own default: a legacy vendor row (one that
  // predates this key) reads back with the field genuinely absent at
  // runtime even though BoardSettings says it's required — see
  // boardSettingsSchema's own `.default(true)` for the same backward-compat
  // rationale one layer down.
  const [customerNotify, setCustomerNotify] = useState(
    initial.customer_telegram_notify_enabled ?? true,
  );
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const { pending: savingThresholds, run: runThresholds } = useAsyncAction(
    "Could not save timing settings. Please try again.",
  );

  const [soundId, setSoundId] = useState<SoundId>(initial.sound_id);
  const { pending: savingSound, run: runSound } = useAsyncAction(
    "Could not save your sound. Please try again.",
  );

  const {
    desktopNotify,
    permission,
    onClient,
    savingNotify,
    toggleDesktopNotify,
    enableInBrowser,
  } = useDesktopNotifySection(initial.desktop_notify, router);

  const [dailyReset, setDailyReset] = useState(
    initial.daily_order_number_reset,
  );
  const [showWaitEstimate, setShowWaitEstimate] = useState(
    initial.show_wait_estimate,
  );
  const [defaultPrepMin, setDefaultPrepMin] = useState(
    initial.default_prep_minutes !== null &&
      initial.default_prep_minutes !== undefined
      ? String(initial.default_prep_minutes)
      : "",
  );
  const [displayError, setDisplayError] = useState<string | null>(null);
  const { pending: savingDisplay, run: runDisplay } = useAsyncAction(
    "Could not save the customer screen settings. Please try again.",
  );

  const { pending: savingSwitch, run: runSwitch } = useAsyncAction(
    "Could not save that setting. Please try again.",
  );

  // A switch saves the moment it is flipped, as the sound and the desktop
  // notification choices already do: it has no half-typed state to protect,
  // and a switch that silently waits for a button further down the card reads
  // as saved when it is not. The number fields keep their Save button.
  function saveSwitch(
    key:
      | "customer_telegram_notify_enabled"
      | "daily_order_number_reset"
      | "show_wait_estimate",
    value: boolean,
    set: (value: boolean) => void,
  ) {
    set(value);
    return runSwitch(async () => {
      try {
        const res = await updateBoardSettings({ [key]: value });
        if (!res.success) {
          set(!value);
          toast.error(res.error);
          return;
        }
        toast.success("Saved");
        router.refresh();
      } catch (error) {
        set(!value);
        throw error;
      }
    });
  }

  // Validate local values together; each save sends only its section's fields.
  function currentSettings() {
    return {
      aging_min: Number(agingMin),
      overdue_min: Number(overdueMin),
      sound_id: soundId,
      desktop_notify: desktopNotify,
      undo_seconds: Number(undoSeconds),
      daily_order_number_reset: dailyReset,
      show_wait_estimate: showWaitEstimate,
      default_prep_minutes:
        defaultPrepMin.trim() === "" ? null : Number(defaultPrepMin),
      ready_auto_clear_min:
        readyAutoClearMin.trim() === "" ? null : Number(readyAutoClearMin),
      customer_telegram_notify_enabled: customerNotify,
    };
  }

  function saveThresholds() {
    return saveBoardSettingsSection({
      parsed: boardSettingsSchema.safeParse(currentSettings()),
      setError: setThresholdError,
      fallbackErrorMessage: "Check the thresholds",
      run: runThresholds,
      successMessage: "Timing saved",
      router,
      keys: [
        "aging_min",
        "overdue_min",
        "undo_seconds",
        "ready_auto_clear_min",
      ],
    });
  }

  function chooseSound(id: SoundId) {
    const previous = soundId;
    setSoundId(id);
    // Play it right on click — a separate "switch, then press Preview" step
    // is one tap too many just to hear what you picked.
    unlockAudio();
    void playSound(id);
    return runSound(async () => {
      try {
        const res = await updateBoardSettings({
          sound_id: id,
        });
        if (!res.success) {
          setSoundId(previous);
          toast.error(res.error);
          return;
        }
        router.refresh();
      } catch (error) {
        setSoundId(previous);
        throw error;
      }
    });
  }

  function saveDisplay() {
    return saveBoardSettingsSection({
      parsed: boardSettingsSchema.safeParse(currentSettings()),
      setError: setDisplayError,
      fallbackErrorMessage: "Check the wait estimate",
      run: runDisplay,
      successMessage: "Backup time saved",
      router,
      keys: ["default_prep_minutes"],
    });
  }

  const thresholdsUnchanged =
    agingMin === String(initial.aging_min) &&
    overdueMin === String(initial.overdue_min) &&
    undoSeconds === String(initial.undo_seconds) &&
    readyAutoClearMin ===
      (initial.ready_auto_clear_min !== null &&
      initial.ready_auto_clear_min !== undefined
        ? String(initial.ready_auto_clear_min)
        : "");

  const displayUnchanged =
    defaultPrepMin ===
    (initial.default_prep_minutes !== null &&
    initial.default_prep_minutes !== undefined
      ? String(initial.default_prep_minutes)
      : "");

  // Two independent stacks, not a CSS grid: a grid's row tracks size to
  // the tallest cell in that row, so once "Board timing" (col 1, three
  // inputs) outgrew "New-order sound" (col 2, one row of buttons), row 2
  // started late in BOTH columns — a gap over "Customer order screen"
  // that had nothing to do with its own content. Each column stacking
  // its own two sections avoids that row-sync entirely.
  return (
    <TwoColumnSections
      columnOne={
        <>
          <BoardTimingSection
            agingMin={agingMin}
            onAgingMinChange={setAgingMin}
            overdueMin={overdueMin}
            onOverdueMinChange={setOverdueMin}
            undoSeconds={undoSeconds}
            onUndoSecondsChange={setUndoSeconds}
            readyAutoClearMin={readyAutoClearMin}
            onReadyAutoClearMinChange={setReadyAutoClearMin}
            error={thresholdError}
            saving={savingThresholds}
            unchanged={thresholdsUnchanged}
            onSave={saveThresholds}
          />

          <DesktopNotifySection
            desktopNotify={desktopNotify}
            permission={permission}
            onClient={onClient}
            savingNotify={savingNotify}
            toggleDesktopNotify={toggleDesktopNotify}
            enableInBrowser={enableInBrowser}
          >
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <Switch
                checked={customerNotify}
                onCheckedChange={(checked) =>
                  saveSwitch(
                    "customer_telegram_notify_enabled",
                    checked,
                    setCustomerNotify,
                  )
                }
                disabled={savingSwitch}
                aria-label="Notify customers on Telegram when their order is ready"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium">
                Notify customers on Telegram when their order is ready
                <InfoTooltip
                  content="Fires the same Telegram ping a customer opted into on the order-status page. Turning this off doesn't touch their connection, it just stops this booth from using it."
                  ariaLabel="About notifying customers on Telegram"
                  trigger="tap"
                />
              </span>
            </div>
          </DesktopNotifySection>
        </>
      }
      columnTwo={
        <>
          <Section
            icon={<Volume2 className="size-5" />}
            title="New-order sound"
            description="Plays when an order lands while this tab is open."
          >
            <ToggleGroup
              type="single"
              value={soundId}
              onValueChange={(v) => v && chooseSound(v as SoundId)}
              disabled={savingSound}
              spacing={2}
              aria-label="New-order sound"
              className="grid grid-cols-3"
            >
              {SOUND_OPTIONS.map((opt) => (
                <ToggleGroupItem
                  key={opt.id}
                  value={opt.id}
                  className={cn(
                    "rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 [@media(pointer:coarse)]:min-h-11",
                    "data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary",
                  )}
                >
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Section>

          <Section
            icon={<Hourglass className="size-5" />}
            title="Customer order screen"
            description="Three optional tweaks to what a customer sees right after ordering: a simpler order number, whether a wait estimate shows at all, and a backup wait estimate."
          >
            <div className="flex items-center gap-3">
              <Switch
                checked={dailyReset}
                onCheckedChange={(checked) =>
                  saveSwitch("daily_order_number_reset", checked, setDailyReset)
                }
                disabled={savingSwitch}
                aria-label="Show a simple daily order number instead of the permanent one"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium">
                Simple daily order number
                <InfoTooltip
                  content="Customers and staff see a short ticket number like 003 instead of 0847. Records, receipts, and reports still use the permanent number underneath."
                  ariaLabel="About daily order numbers"
                  trigger="tap"
                />
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={showWaitEstimate}
                onCheckedChange={(checked) =>
                  saveSwitch("show_wait_estimate", checked, setShowWaitEstimate)
                }
                disabled={savingSwitch}
                aria-label="Show a wait-time estimate to customers"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium">
                Show wait-time estimate
                <InfoTooltip
                  content={`Off shows only the queue position ("2 orders ahead of you"), never a minute guess. Doesn't affect the queue position itself, only the estimate layered on top of it.`}
                  ariaLabel="About the wait estimate"
                  trigger="tap"
                />
              </span>
            </div>

            <div
              className={cn(
                "space-y-2 border-t border-border pt-4",
                !showWaitEstimate && "opacity-50",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Label htmlFor="default-prep-min" className={FORM_LABEL_CLASS}>
                  Backup prep time
                </Label>
                <InfoTooltip
                  content="Estimates a customer's wait until this booth has enough of today's own order history. Leave blank to show queue position instead."
                  ariaLabel="About the fallback estimate"
                  trigger="tap"
                />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="default-prep-min"
                  type="number"
                  min={1}
                  max={60}
                  placeholder="Not set"
                  value={defaultPrepMin}
                  onChange={(e) => setDefaultPrepMin(e.target.value)}
                  disabled={!showWaitEstimate}
                  className="h-11 w-28 rounded-xl"
                  aria-invalid={!!displayError}
                  aria-describedby={displayError ? "display-error" : undefined}
                />
                <span className="text-sm text-muted-foreground">
                  min per order
                </span>
              </div>
              <BackupPrepHelpText
                showWaitEstimate={showWaitEstimate}
                prepEstimate={prepEstimate}
                defaultPrepMin={defaultPrepMin}
              />
            </div>

            {displayError && (
              <p id="display-error" className={FORM_ERROR_CLASS}>
                {displayError}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={saveDisplay}
                disabled={savingDisplay || displayUnchanged}
                className="h-10 rounded-xl font-semibold"
              >
                {savingDisplay ? "Saving…" : "Save backup time"}
              </Button>
            </div>
          </Section>
        </>
      }
    />
  );
}
