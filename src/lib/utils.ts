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
/** True when at least one option group offers a choice; empty groups give the customer nothing to pick. */
export function itemHasChoices(item: {
  option_groups?: { choices: unknown[] }[];
}): boolean {
  return (item.option_groups ?? []).some((g) => g.choices.length > 0);
}

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
