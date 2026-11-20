import { cn } from "@merqo/ui/primitives";

/**
 * A ring that pulses around whatever the visitor should tap next. It is a
 * sibling layer rather than an outline on the button, because the ticket's
 * action button clips its own overflow. Reduced motion keeps the ring and
 * drops the pulse, so the cue still reads.
 */
export function Cue({
  active,
  tone,
  className,
  children,
}: {
  active: boolean;
  tone: "foreground" | "primary";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("relative block", className)}>
      {children}
      {active && (
        <span
          aria-hidden="true"
          data-cue=""
          className={cn(
            "pointer-events-none absolute -inset-1 rounded-[0.9rem] ring-2 motion-safe:animate-pulse",
            tone === "foreground" ? "ring-foreground" : "ring-primary",
          )}
        />
      )}
    </span>
  );
}
