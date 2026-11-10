"use client";

import { Clock } from "lucide-react";
import { Button, Input, Label } from "@merqo/ui/primitives";

import { Section } from "@/components/widgets/ticket-section";
import { InfoTooltip } from "@merqo/ui";
import { FORM_ERROR_CLASS, FORM_LABEL_CLASS } from "@/lib/utils";

interface Props {
  agingMin: string;
  onAgingMinChange: (value: string) => void;
  overdueMin: string;
  onOverdueMinChange: (value: string) => void;
  undoSeconds: string;
  onUndoSecondsChange: (value: string) => void;
  readyAutoClearMin: string;
  onReadyAutoClearMinChange: (value: string) => void;
  error: string | null;
  saving: boolean;
  unchanged: boolean;
  onSave: () => void;
}

export function BoardTimingSection({
  agingMin,
  onAgingMinChange,
  overdueMin,
  onOverdueMinChange,
  undoSeconds,
  onUndoSecondsChange,
  readyAutoClearMin,
  onReadyAutoClearMinChange,
  error: thresholdError,
  saving: savingThresholds,
  unchanged: thresholdsUnchanged,
  onSave: saveThresholds,
}: Props) {
  return (
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
                  onChange={(e) => onAgingMinChange(e.target.value)}
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
                  onChange={(e) => onOverdueMinChange(e.target.value)}
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
                <Label htmlFor="undo-seconds" className={FORM_LABEL_CLASS}>
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
                  onChange={(e) => onUndoSecondsChange(e.target.value)}
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
                  onChange={(e) => onReadyAutoClearMinChange(e.target.value)}
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
  );
}
