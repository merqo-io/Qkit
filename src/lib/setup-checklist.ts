export type ChecklistKey =
  | "booth"
  | "menu"
  | "payment"
  | "live"
  | "test-order"
  | "tv";

export interface ChecklistBooth {
  id: string;
  menuItemCount: number;
  hasPayment: boolean;
  open: boolean;
}

export interface ChecklistFlags {
  paymentSkipped: boolean;
  qrViewed: boolean;
  tvOpened: boolean;
}

export interface ChecklistInput {
  /** The vendor's earliest booth, or null before they have one. */
  booth: ChecklistBooth | null;
  /** Whether any order exists on any of the vendor's booths. */
  hasOrders: boolean;
  flags: ChecklistFlags;
}

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  /** One line shown under the label when the item is the next step. */
  detail: string;
  /** Null while there is no booth to send the vendor to. */
  href: string | null;
  done: boolean;
  optional: boolean;
  /** Reserved for a short walkthrough video; nothing renders it yet. */
  videoUrl: string | null;
}

export interface ChecklistState {
  items: ChecklistItem[];
  requiredTotal: number;
  requiredDone: number;
  allRequiredDone: boolean;
  next: ChecklistItem | null;
}

export const NO_FLAGS: ChecklistFlags = {
  paymentSkipped: false,
  qrViewed: false,
  tvOpened: false,
};

/**
 * Where each setup step stands, from data the app already has. An existing
 * vendor with orders counts as live and tested, so the checklist never
 * nags someone who is plainly past setup. Optional steps never block hiding.
 */
export function deriveChecklist(input: ChecklistInput): ChecklistState {
  const { booth, hasOrders, flags } = input;
  const boothLink = (tail: string) =>
    booth ? `/dashboard/booths/${booth.id}${tail}` : null;

  const items: ChecklistItem[] = [
    {
      key: "booth",
      label: "Create a booth",
      detail: "Give it a name. You can add a photo later.",
      href: "/dashboard/booths/new",
      done: booth !== null,
      optional: false,
      videoUrl: null,
    },
    {
      key: "menu",
      label: "Add menu items",
      detail: "Add at least one item customers can order.",
      href: boothLink("/menu"),
      done: (booth?.menuItemCount ?? 0) > 0,
      optional: false,
      videoUrl: null,
    },
    {
      key: "payment",
      label: "Connect payment",
      detail: "Set up PayNow, or choose to take payment at the counter.",
      href: boothLink("#payment"),
      done: booth !== null && (booth.hasPayment || flags.paymentSkipped),
      optional: false,
      videoUrl: null,
    },
    {
      key: "live",
      label: "Go live",
      detail: "Open your booth and look at your QR code.",
      href: boothLink("/qr"),
      done: booth !== null && booth.open && (flags.qrViewed || hasOrders),
      optional: false,
      videoUrl: null,
    },
    {
      key: "test-order",
      label: "Place a test order",
      detail: "Scan your QR code and order. It shows up on this board.",
      href: boothLink("/qr"),
      done: hasOrders,
      optional: false,
      videoUrl: null,
    },
    {
      key: "tv",
      label: "Set up the TV",
      detail: "Optional. Tap Customer screen at the top of the board.",
      href: null,
      done: flags.tvOpened,
      optional: true,
      videoUrl: null,
    },
  ];

  const required = items.filter((i) => !i.optional);
  const requiredDone = required.filter((i) => i.done).length;
  return {
    items,
    requiredTotal: required.length,
    requiredDone,
    allRequiredDone: requiredDone === required.length,
    next: items.find((i) => !i.done && !i.optional) ?? null,
  };
}
