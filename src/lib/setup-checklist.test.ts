import { describe, expect, it } from "vitest";
import {
  NO_FLAGS,
  deriveChecklist,
  type ChecklistBooth,
} from "./setup-checklist";

const booth = (over: Partial<ChecklistBooth> = {}): ChecklistBooth => ({
  id: "b1",
  menuItemCount: 0,
  hasPayment: false,
  open: true,
  ...over,
});

const doneKeys = (s: ReturnType<typeof deriveChecklist>) =>
  s.items.filter((i) => i.done).map((i) => i.key);

describe("deriveChecklist", () => {
  it("points at creating a booth when there is none", () => {
    const s = deriveChecklist({
      booth: null,
      hasOrders: false,
      flags: NO_FLAGS,
    });
    expect(doneKeys(s)).toEqual([]);
    expect(s.next?.key).toBe("booth");
    expect(s.next?.href).toBe("/dashboard/booths/new");
    expect(s.items.find((i) => i.key === "menu")?.href).toBeNull();
    expect(s.requiredDone).toBe(0);
    expect(s.requiredTotal).toBe(5);
  });

  it("moves to the menu once a booth exists", () => {
    const s = deriveChecklist({
      booth: booth(),
      hasOrders: false,
      flags: NO_FLAGS,
    });
    expect(doneKeys(s)).toEqual(["booth"]);
    expect(s.next?.key).toBe("menu");
    expect(s.next?.href).toBe("/dashboard/booths/b1/menu");
  });

  it("counts payment as done when the booth takes payment", () => {
    const s = deriveChecklist({
      booth: booth({ menuItemCount: 2, hasPayment: true }),
      hasOrders: false,
      flags: NO_FLAGS,
    });
    expect(doneKeys(s)).toEqual(["booth", "menu", "payment"]);
    expect(s.next?.key).toBe("live");
  });

  it("counts payment as done when skipped, and links to the Payment card otherwise", () => {
    const base = { booth: booth({ menuItemCount: 1 }), hasOrders: false };
    const open = deriveChecklist({ ...base, flags: NO_FLAGS });
    expect(open.next?.key).toBe("payment");
    expect(open.next?.href).toBe("/dashboard/booths/b1#payment");
    const skipped = deriveChecklist({
      ...base,
      flags: { ...NO_FLAGS, paymentSkipped: true },
    });
    expect(skipped.items.find((i) => i.key === "payment")?.done).toBe(true);
  });

  it("needs the booth open and the QR page seen to be live", () => {
    const b = booth({ menuItemCount: 1, hasPayment: true });
    const seen = { ...NO_FLAGS, qrViewed: true };
    const live = (x: ChecklistBooth, flags = seen) =>
      deriveChecklist({ booth: x, hasOrders: false, flags }).items.find(
        (i) => i.key === "live",
      )?.done;
    expect(live(b)).toBe(true);
    expect(live({ ...b, open: false })).toBe(false);
    expect(live(b, NO_FLAGS)).toBe(false);
  });

  it("treats a vendor with orders as live and tested", () => {
    const s = deriveChecklist({
      booth: booth({ menuItemCount: 3, hasPayment: true }),
      hasOrders: true,
      flags: NO_FLAGS,
    });
    expect(s.allRequiredDone).toBe(true);
    expect(s.next).toBeNull();
  });

  it("does not count a closed booth as live even with orders", () => {
    const s = deriveChecklist({
      booth: booth({ menuItemCount: 3, hasPayment: true, open: false }),
      hasOrders: true,
      flags: NO_FLAGS,
    });
    expect(s.next?.key).toBe("live");
  });

  it("never lets the optional TV step block completion", () => {
    const s = deriveChecklist({
      booth: booth({ menuItemCount: 1, hasPayment: true }),
      hasOrders: true,
      flags: NO_FLAGS,
    });
    expect(s.items.find((i) => i.key === "tv")).toMatchObject({
      done: false,
      optional: true,
    });
    expect(s.allRequiredDone).toBe(true);
    const tv = deriveChecklist({
      booth: booth(),
      hasOrders: false,
      flags: { ...NO_FLAGS, tvOpened: true },
    });
    expect(tv.items.find((i) => i.key === "tv")?.done).toBe(true);
    expect(tv.requiredDone).toBe(1);
  });
});
