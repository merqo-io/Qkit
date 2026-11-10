import { cn } from "@merqo/ui/primitives";

const SHADOW_CLASS = {
  none: "",
  flat: "shadow-[0_2px_0_0_var(--color-border)]",
  lifted:
    "shadow-[0_2px_0_0_var(--color-border),0_18px_40px_-24px_oklch(0.4_0.06_45/0.45)]",
} as const;

interface TicketProps extends React.HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "figure";
  shadow?: keyof typeof SHADOW_CLASS;
  radius?: "xl" | "2xl";
  dashed?: boolean;
  /**
   * Clips inner content to the card's border radius (e.g. a full-bleed photo
   * at the top of a list card) — but also clips the ticket's own scalloped
   * top edge (`.ticket::before` deliberately overlaps -1px to mask the card's
   * border line there). Only set this when a child genuinely bleeds to the
   * edge; otherwise the scallop gets cut off for no reason, which is why
   * these cards used to look inconsistent.
   */
  clip?: boolean;
  /**
   * "custom" skips the default border-color class, for the rare card whose
   * border color is driven by something else entirely (e.g. order-card's
   * status-wash classes set border-color directly) — pass that color class
   * through `className` instead. Ticket still supplies the border *width*.
   */
  borderColor?: "default" | "custom";
}

/**
 * The "kitchen ticket" card look shared across the app: paper background,
 * scalloped/perforated top edge (`.ticket` in globals.css). Centralizes the
 * border/radius/shadow classes so every card actually looks the same —
 * previously each usage hand-rolled its own combination, and several picked
 * up `overflow-hidden` with no bleeding content to justify it, silently
 * clipping their scallop.
 */
export function Ticket({
  as: As = "div",
  shadow = "flat",
  radius = "2xl",
  dashed = false,
  clip = false,
  borderColor = "default",
  className,
  children,
  ...props
}: TicketProps) {
  let borderClass: string | false;
  if (borderColor === "custom") borderClass = dashed && "border-dashed";
  else if (dashed) borderClass = "border-dashed border-border";
  else borderClass = "border-border";

  return (
    <As
      className={cn(
        "ticket border",
        radius === "2xl" ? "rounded-2xl" : "rounded-xl",
        borderClass,
        SHADOW_CLASS[shadow],
        clip && "overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}
