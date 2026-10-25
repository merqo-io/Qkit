"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Clock, Hourglass, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Section } from "@/components/widgets/ticket-section";
import { Hint } from "@/components/widgets/hint";
import { InfoTooltip, TwoColumnSections } from "@merqo/ui";
import { useAsyncAction } from "@/hooks/use-async-action";
import { boardSettingsSchema, type BoardSettingsInput } from "@/lib/schemas";
import {
  isNotifySupported,
  notifyPermission,
  playSound,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import { cn, FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";
import type { BoardSettings, SoundId } from "@/lib/types";
import { updateBoardSettings } from "./actions";

const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "bell", label: "Bell" },
  { id: "ding", label: "Ding" },
  { id: "horn", label: "Horn" },
  { id: "triple", label: "Triple beep" },
  { id: "none", label: "Off" },
];

type PrepEstimate = {
  avgMinutes: number | null;
  sampleCount: number;
  minSample: number;
};

/** Help text under the backup prep-time input: explains what customers
 *  actually see right now — off, live-estimate, or not-enough-history. */
function BackupPrepHelpText({
  showWaitEstimate,
  prepEstimate,
  defaultPrepMin,
}: {
  showWaitEstimate: boolean;
  prepEstimate: PrepEstimate;
  defaultPrepMin: string;
}) {
  if (!showWaitEstimate) {
    return (
      <p className="text-xs text-muted-foreground">
        Wait-time estimate is off above, so this backup isn&apos;t shown to
        customers either.
      </p>
    );
  }
  if (prepEstimate.avgMinutes !== null) {
    return (
      <p className="text-xs text-muted-foreground">
        Live right now: about {Math.round(prepEstimate.avgMinutes)} min per
        order, the typical time across your last {prepEstimate.sampleCount}{" "}
        orders. This backup isn&apos;t in use.
      </p>
    );
  }
  const fallback =
    defaultPrepMin.trim() === ""
      ? "their queue position"
      : "this backup number";
  return (
    <p className="text-xs text-muted-foreground">
      Not enough recent order history yet ({prepEstimate.sampleCount} of{" "}
      {prepEstimate.minSample} orders). Customers currently see {fallback}{" "}
      instead.
    </p>
  );
}

/** Validate local settings, then persist only the section's owned fields. */
function saveBoardSettingsSection({
  parsed,
  setError,
  fallbackErrorMessage,
  run,
  successMessage,
  router,
  keys,
}: {
  parsed: ReturnType<typeof boardSettingsSchema.safeParse>;
  setError: (message: string | null) => void;
  fallbackErrorMessage: string;
  run: (fn: () => Promise<void>) => Promise<void>;
  successMessage: string;
  router: ReturnType<typeof useRouter>;
  keys: (keyof BoardSettingsInput)[];
}) {
  if (!parsed.success) {
    setError(parsed.error.issues[0]?.message ?? fallbackErrorMessage);
    return;
  }
  setError(null);
  return run(async () => {
    const patch = Object.fromEntries(
      keys.map((key) => [key, parsed.data[key]]),
    );
    const res = await updateBoardSettings(patch);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(successMessage);
    router.refresh();
  });
}

/**
 * Desktop-notification toggle + browser-permission flow, factored out of
 * SettingsForm: the account-level `desktop_notify` setting (synced across
 * devices) and the browser-level `Notification.permission` (this device
 * only) are two different concerns that both gate on the same
 * gesture-triggered grant flow.
 */
function useDesktopNotifySection(
  initialDesktopNotify: boolean,
  router: ReturnType<typeof useRouter>,
) {
  const [desktopNotify, setDesktopNotify] = useState(initialDesktopNotify);
  // Browser-level permission, separate from `desktop_notify` (the account
  // setting, synced across devices). Notification.permission doesn't itself
  // trigger a re-render, so this is tracked explicitly and only updated after
  // OUR OWN request calls — never re-read from the browser mid-render.
  const [permission, setPermission] = useState(() => notifyPermission());
  // The browser's answer is only known on the client. useSyncExternalStore
  // returns the server snapshot (false) during hydration, then the client
  // one, so the permission note never mismatches the server's markup.
  const onClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { pending: savingNotify, run: runNotify } = useAsyncAction(
    "Could not update notifications. Please try again.",
  );

  // Gesture-gated — only ever called from a click, the one reliable moment
  // to unlock audio + ask permission (web.dev double-opt-in guidance).
  async function grantPermission(): Promise<boolean> {
    unlockAudio();
    if (!isNotifySupported()) {
      toast.error("Your browser doesn't support desktop notifications.");
      return false;
    }
    const result = await requestNotifyPermission();
    setPermission(result);
    if (result !== "granted") {
      toast.error(
        "Notifications blocked. Enable them for this site in your browser settings, then try again.",
      );
      return false;
    }
    return true;
  }

  function toggleDesktopNotify() {
    return runNotify(async () => {
      const next = !desktopNotify;
      if (next && !(await grantPermission())) return;
      const res = await updateBoardSettings({
        desktop_notify: next,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setDesktopNotify(next);
      toast.success(next ? "Notifications on" : "Notifications off");
      router.refresh();
    });
  }

  // Re-request browser permission without touching the (already-on) account
  // setting — the toggle above can't reach this path once desktopNotify is
  // already true, since clicking it there means turning OFF.
  function enableInBrowser() {
    return runNotify(async () => {
      if (await grantPermission()) {
        toast.success("Notifications enabled in this browser");
      }
    });
  }

  return {
    desktopNotify,
    permission,
    onClient,
    savingNotify,
    toggleDesktopNotify,
    enableInBrowser,
  };
}

/**
 * The "Notifications" section's toggle + browser-permission sub-affordance.
 * `children` are the card's other notification switches.
 */
function DesktopNotifySection({
  desktopNotify,
  permission,
  onClient,
  savingNotify,
  toggleDesktopNotify,
  enableInBrowser,
  children,
}: {
  desktopNotify: boolean;
  permission: NotificationPermission | null;
  onClient: boolean;
  savingNotify: boolean;
  toggleDesktopNotify: () => void;
  enableInBrowser: () => void;
  children?: React.ReactNode;
}) {
  // The setting is account-wide and syncs across devices, so it stays on
  // here; the label says this device is the one not getting popups.
  const blockedHere = onClient && desktopNotify && permission !== "granted";
  let statusLabel = "Off";
  if (blockedHere) statusLabel = "On, but not on this device";
  else if (desktopNotify) statusLabel = "On";
  return (
    <Section
      icon={<Bell className="size-5" />}
      title="Notifications"
      description="A popup for a new order when this tab is backgrounded."
    >
      <div className="flex items-center gap-3">
        <Switch
          checked={desktopNotify}
          onCheckedChange={toggleDesktopNotify}
          disabled={savingNotify}
          aria-label="Desktop notifications"
          className={cn(blockedHere && "data-[state=checked]:bg-warning")}
        />
        <span
          className={cn(
            "text-sm font-semibold",
            blockedHere && "text-warning",
            !blockedHere && desktopNotify && "text-success",
            !desktopNotify && "text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
        {/* A tap-to-open hint beside the switch, not the section title's
            hover tooltip: this one is written for iPhone and iPad, where a
            hover tooltip cannot be opened at all. */}
        <Hint label="About notifications on iPhone and iPad">
          Works on Android and desktop browsers. On iPhone or iPad, add qkit to
          your Home Screen first. A regular Safari tab cannot show these.
        </Hint>
      </div>
      {blockedHere && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {isNotifySupported()
              ? "Not allowed in this browser yet. This device won't show popups until you enable it."
              : "Not supported in this browser. On iPhone or iPad, add qkit to your Home Screen first."}
          </p>
          {isNotifySupported() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={enableInBrowser}
              disabled={savingNotify}
              className="h-7 rounded-lg text-xs"
            >
              Enable in this browser
            </Button>
          )}
        </div>
      )}
      {children}
    </Section>
  );
}

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
          <Section
            icon={<Clock className="size-5" />}
            title="Board timing"
            description="How fast a waiting ticket changes color, how long staff have to undo an accidental tap, and whether a forgotten ready order clears itself."
          >
            <div className="space-y-5">
              {/* Two groups, not one flat grid: amber/red are slow aging
                thresholds (minutes, how a ticket's colour drifts over
                time), undo/auto-clear are fast recovery timers (seconds
                and a short number of minutes, how quickly a mistake or a
                forgotten ticket resolves itself). Mixing all four in one
                unlabeled block read as an arbitrary pile of numbers. */}
              <div>
                <p className="mb-2 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                  Ticket color
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="aging-min" className={FORM_LABEL_CLASS}>
                        Turn amber after
                      </Label>
                      <InfoTooltip
                        content="Minutes after an order is placed before its ticket turns amber, flagging it as starting to wait."
                        ariaLabel="About the amber threshold"
                        trigger="tap"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="aging-min"
                        type="number"
                        min={1}
                        max={240}
                        value={agingMin}
                        onChange={(e) => setAgingMin(e.target.value)}
                        className="h-11 rounded-xl"
                        aria-invalid={!!thresholdError}
                        aria-describedby={
                          thresholdError ? "threshold-error" : undefined
                        }
                      />
                      <span className="text-sm text-muted-foreground">min</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="overdue-min" className={FORM_LABEL_CLASS}>
                        Turn red after
                      </Label>
                      <InfoTooltip
                        content="Minutes before a still-waiting ticket turns red instead of amber. Must be later than the amber threshold."
                        ariaLabel="About the red threshold"
                        trigger="tap"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="overdue-min"
                        type="number"
                        min={1}
                        max={240}
                        value={overdueMin}
                        onChange={(e) => setOverdueMin(e.target.value)}
                        className="h-11 rounded-xl"
                        aria-invalid={!!thresholdError}
                        aria-describedby={
                          thresholdError ? "threshold-error" : undefined
                        }
                      />
                      <span className="text-sm text-muted-foreground">min</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                  Quick timers
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor="undo-seconds"
                        className={FORM_LABEL_CLASS}
                      >
                        Undo window
                      </Label>
                      <InfoTooltip
                        content="Mark Ready / Mark Picked Up applies right away. For this many seconds after, the button turns into Undo instead, in case of a wrong tap."
                        ariaLabel="About undoing a tap"
                        trigger="tap"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="undo-seconds"
                        type="number"
                        min={2}
                        max={15}
                        value={undoSeconds}
                        onChange={(e) => setUndoSeconds(e.target.value)}
                        className="h-11 rounded-xl"
                        aria-invalid={!!thresholdError}
                        aria-describedby={
                          thresholdError ? "threshold-error" : undefined
                        }
                      />
                      <span className="text-sm text-muted-foreground">sec</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor="ready-auto-clear-min"
                        className={FORM_LABEL_CLASS}
                      >
                        Auto-clear after
                      </Label>
                      <InfoTooltip
                        content="A ready order nobody marks Picked Up clears itself after this many minutes. Leave blank to turn off. Restore a wrongly-cleared order from Completed orders."
                        ariaLabel="About clearing ready orders"
                        trigger="tap"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="ready-auto-clear-min"
                        type="number"
                        min={1}
                        max={60}
                        placeholder="Off"
                        value={readyAutoClearMin}
                        onChange={(e) => setReadyAutoClearMin(e.target.value)}
                        className="h-11 rounded-xl"
                        aria-invalid={!!thresholdError}
                        aria-describedby={
                          thresholdError ? "threshold-error" : undefined
                        }
                      />
                      <span className="text-sm text-muted-foreground">min</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {thresholdError && (
              <p id="threshold-error" className={FORM_ERROR_CLASS}>
                {thresholdError}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={saveThresholds}
                disabled={savingThresholds || thresholdsUnchanged}
                className="h-10 rounded-xl font-semibold"
              >
                {savingThresholds ? "Saving…" : "Save timing"}
              </Button>
            </div>
          </Section>

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
