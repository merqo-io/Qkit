import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shared field-label style across the vendor form pages. */
export const FORM_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

/** Shared inline field-error style across the vendor form pages. */
export const FORM_ERROR_CLASS = "text-sm font-medium text-destructive";

/**
 * The small-caps label above a page title or a block of content ("ORDER
 * HISTORY", "AMOUNT TO PAY"). Wider-tracked than FORM_LABEL_CLASS, which
 * labels a single field.
 */
export const EYEBROW_CLASS =
  "text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground";

/** Milliseconds in one hour. Shared by hourly stats bucketing. */
export const MS_PER_HOUR = 3_600_000;

/** Milliseconds in one day. Shared by rolling-window stats cutoffs. */
export const MS_PER_DAY = 86_400_000;

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
  }).format(cents / 100);
}

/** Cents → a plain "12.34" decimal string (no currency symbol) for inputs/CSV. */
export function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Parse a user-typed dollar string into integer cents for storage.
 * `""` → ok with `undefined` (field cleared); a valid non-negative number → ok
 * with rounded cents; anything else (NaN, negative) → not ok, so the caller
 * rejects the keystroke and keeps the prior value.
 */
export function parseDollarsToCents(
  raw: string,
): { ok: true; cents: number | undefined } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, cents: undefined };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return { ok: false };
  return { ok: true, cents: Math.round(value * 100) };
}

/** True when at least one item carries a price (drives whether money is shown). */
export function orderHasPricing(
  items: { price_cents?: number | null }[],
): boolean {
  return items.some(
    (i) => i.price_cents !== null && i.price_cents !== undefined,
  );
}

/** Count with a pluralized noun: "1 item" / "3 items" / "0 items". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** Render selected options as a single muted line, e.g. "Iced · Less". Empty when none. */
export function formatOptions(options?: { choice: string }[] | null): string {
  return options && options.length
    ? options.map((o) => o.choice).join(" · ")
    : "";
}

/** Label for a menu item's add/customize button, shared by the customer
 *  order form and the vendor's walk-up order dialog. */
export function menuItemActionLabel(
  soldOut: boolean,
  hasOptions: boolean,
): string {
  if (soldOut) return "Sold out";
  if (hasOptions) return "Customize";
  return "Add";
}

/** True for `null` and `undefined`, the two "no value" states a nullable column can hold. */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}
