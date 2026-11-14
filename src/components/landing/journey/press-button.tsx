import type { ButtonHTMLAttributes } from "react";

import { cn } from "@merqo/ui/primitives";

// One hover (darken), one pressed state that fires on touch, one focus ring.
// No lift, scale or glow.
export function PressButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center rounded-lg border-[1.5px] border-foreground bg-foreground px-5 text-[0.9375rem] font-semibold text-background transition-colors hover:bg-foreground/85 active:translate-y-px active:bg-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    />
  );
}
