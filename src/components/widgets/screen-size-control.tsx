"use client";

import { Button, cn } from "@merqo/ui/primitives";

import { type ScreenScaleKey, useScreenScale } from "@/hooks/use-screen-scale";

const STEP_BUTTON = "min-h-10 min-w-10 rounded-full px-3";

export function ScreenSizeControl({
  screen,
  className,
}: {
  screen: ScreenScaleKey;
  className?: string;
}) {
  const { percent, canDecrease, canIncrease, decrease, increase, reset } =
    useScreenScale(screen);
  return (
    <div
      role="group"
      aria-label="Text size"
      className={cn("flex items-center gap-1", className)}
    >
      <Button
        variant="outline"
        className={STEP_BUTTON}
        onClick={decrease}
        disabled={!canDecrease}
        aria-label="Smaller text"
      >
        A-
      </Button>
      <Button
        variant="outline"
        className={cn(STEP_BUTTON, "tabular-nums")}
        onClick={reset}
        disabled={percent === 100}
        aria-label="Reset text size"
      >
        {percent}%
      </Button>
      <Button
        variant="outline"
        className={STEP_BUTTON}
        onClick={increase}
        disabled={!canIncrease}
        aria-label="Larger text"
      >
        A+
      </Button>
    </div>
  );
}
