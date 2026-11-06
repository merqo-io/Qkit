import { cn } from "@/lib/utils";
import { StatCard } from "@merqo/ui";

/**
 * A back-office figure, set in Space Mono like a printed receipt total. The
 * `featured` variant wears the ticket's perforated edge — the one figure that
 * leads the page. Wraps `@merqo/ui`'s `StatCard`, overriding its elevated
 * shell back to qkit's flat bordered card, and adds the staggered fade-in.
 */
export function Stat({
  label,
  value,
  delta,
  big,
  featured,
  delay,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  big?: boolean;
  featured?: boolean;
  delay?: number;
}) {
  let valueSize: string;
  if (featured) valueSize = "text-4xl";
  else if (big) valueSize = "text-3xl";
  else valueSize = "text-2xl";
  return (
    // The card takes no inline style, so the animation lives on this wrapper.
    <div
      className={cn("fade-rise", big && "sm:col-span-2")}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <StatCard
        label={label}
        value={String(value)}
        featured={featured}
        className={cn(
          "h-full rounded-xl border-border shadow-none",
          featured && "ticket",
        )}
        valueClassName={cn("font-mono font-bold tabular-nums", valueSize)}
        delta={delta}
        deltaTooltip="vs the previous 7 days"
        deltaDownClassName="bg-status-cancelled/12 text-status-cancelled"
      />
    </div>
  );
}
