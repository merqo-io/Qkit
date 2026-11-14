import type { ComponentProps } from "react";

import { cn } from "@merqo/ui/primitives";

// One hover (darken), one colour-only pressed state that fires on touch, one
// focus ring. No lift, scale, movement or glow.
export function PressButton({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center rounded-lg border-[1.5px] border-foreground bg-foreground px-5 text-[0.9375rem] font-semibold text-background transition-colors hover:bg-foreground/85 active:bg-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    />
  );
}
