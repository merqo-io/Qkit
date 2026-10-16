import { describe, expect, it, vi, beforeEach } from "vitest";
import { ENTITLEMENTS } from "@/lib/plan";
import type { BoothFormInput, MenuItemFormInput } from "@/lib/schemas";
import {
  saveBooth,
  saveMenuCategories,
  saveMenuItems,
  toggleBoothActive,
  deleteBooth,
} from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// after() needs a live request scope; run the callback inline instead.
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => void fn(),
}));

const { sweepUnsavedUploadsMock } = vi.hoisted(() => ({
  sweepUnsavedUploadsMock: vi.fn(),
}));
vi.mock("./sweep-unsaved-uploads", () => ({
  sweepUnsavedUploads: sweepUnsavedUploadsMock,
}));

// Only paykit's answer is faked: `setupKind` is the real mapping from it to
// the marker's kind.
const { vendorPaymentSetupMock } = vi.hoisted(() => ({
  vendorPaymentSetupMock: vi.fn(),
}));
vi.mock("@/lib/paykit/payment-setup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paykit/payment-setup")>()),
  vendorPaymentSetup: vendorPaymentSetupMock,
}));

const { registerPrintLocationMock } = vi.hoisted(() => ({
  registerPrintLocationMock: vi.fn(),
}));
vi.mock("@/lib/printkit/client", () => ({
  registerPrintLocation: registerPrintLocationMock,
}));

// Mock the entitlement loader and the supabase server client. saveBooth's entry
// order is: parse → loadEntitlement → count-cap checks (no DB) → strip
// hours/stock → createServerClient → active-booth gate → insert|update.
//
// The supabase client models the "booths" chains saveBooth/deleteBooth use:
//  - active-booth COUNT:  select("id",{count,head:true}).eq.eq[.neq]  (awaited directly)
//  - INSERT (create):     insert(row).select("id").single()
//  - UPDATE (edit):       update(row).eq("id").select("id").maybeSingle()
//                         (preceded by a prev-image read select().eq().maybeSingle())
//  - DELETE:              delete({count:"exact"}).eq("id")  (awaited directly;
//                         deleteBooth's own booth read reuses the prevResult shape)
const h = vi.hoisted(() => {
  const state = {
    count: 0 as number,
    countError: null as { message: string } | null,
    insertResult: { data: { id: "b-new" }, error: null } as {
      data: { id: string } | null;
      error: { message: string } | null;
    },
    updateResult: { data: { id: "b-edit" }, error: null } as {
      data: { id: string } | null;
      error: { message: string } | null;
    },
    prevResult: { data: null } as { data: unknown },
    deleteResult: { count: 1, error: null } as {
      count: number | null;
      error: { message: string } | null;
    },
    authUser: { id: "v1" } as { id: string } | null,
  };
  return {
    state,
    loadEntitlementMock: vi.fn(),
    insertSpy: vi.fn(),
    updateSpy: vi.fn(),
    deleteSpy: vi.fn(),
    neqSpy: vi.fn(),
    removeSpy: vi.fn(),
  };
});

vi.mock("@/lib/supabase/get-entitlement", () => ({
  loadEntitlement: h.loadEntitlementMock,
}));

vi.mock("@/lib/supabase/server", () => {
  const makeClient = () =>
    Promise.resolve({
      auth: {
        getUser: () => Promise.resolve({ data: { user: h.state.authUser } }),
      },
      from: () => ({
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) {
            // Active-booth COUNT query — the builder itself is awaited.
            const builder = {
              eq: () => builder,
              neq: (...args: unknown[]) => {
                h.neqSpy(...args);
                return builder;
              },
              then: (
                resolve: (v: {
                  count: number;
                  error: { message: string } | null;
                }) => void,
              ) => resolve({ count: h.state.count, error: h.state.countError }),
            };
            return builder;
          }
          // Prev-image read (update path) / booth read (delete path).
          return {
            eq: () => ({
              maybeSingle: () => Promise.resolve(h.state.prevResult),
            }),
          };
        },
        insert: (row: unknown) => {
          h.insertSpy(row);
          return {
            select: () => ({
              single: () => Promise.resolve(h.state.insertResult),
            }),
          };
        },
        update: (row: unknown) => {
          h.updateSpy(row);
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve(h.state.updateResult),
              }),
            }),
          };
        },
        delete: (opts: unknown) => {
          h.deleteSpy(opts);
          return {
            eq: () => Promise.resolve(h.state.deleteResult),
          };
        },
      }),
      storage: {
        from: (bucket: string) => ({
          remove: (paths: string[]) => {
            h.removeSpy(bucket, paths);
            return Promise.resolve({ error: null });
          },
        }),
      },
    });
  return {
    createServerClient: makeClient,
    createServiceClient: makeClient,
  };
});

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

function makeItem(over: Partial<MenuItemFormInput> = {}): MenuItemFormInput {
  return {
    id: "i1",
    name: "Coffee",
    description: "",
    available: true,
    ...over,
  };
}

function makeBooth(over: Partial<BoothFormInput> = {}): BoothFormInput {
  return {
    name: "Kopitiam Cart",
    image_url: null,
    is_active: false,
    hours: null,
    menu_categories: [],
    takes_payment: false,
    social_links: null,
    requires_arrival_confirm: false,
    walkup_default: false,
    print_enabled: false,
    pickup_scan_enabled: false,
    paykit_booking_id: null,
    daily_cup_cap: null,
    max_items_per_order: null,
    ...over,
  };
}

beforeEach(() => {
  h.loadEntitlementMock
    .mockReset()
    .mockResolvedValue({ user: { id: "v1" }, entitlement: ENTITLEMENTS.free });
  h.insertSpy.mockReset();
  h.updateSpy.mockReset();
  h.deleteSpy.mockReset();
  h.neqSpy.mockReset();
  h.removeSpy.mockReset();
  h.state.count = 0;
  h.state.countError = null;
  h.state.insertResult = { data: { id: "b-new" }, error: null };
  h.state.updateResult = { data: { id: "b-edit" }, error: null };
  h.state.prevResult = { data: null };
  h.state.deleteResult = { count: 1, error: null };
  h.state.authUser = { id: "v1" };
  vendorPaymentSetupMock
    .mockReset()
    .mockResolvedValue({ state: "paynow", name: "Cart" });
  registerPrintLocationMock.mockReset().mockResolvedValue({
    ok: true,
    data: { id: "loc-1" },
  });
  sweepUnsavedUploadsMock.mockReset().mockResolvedValue(undefined);
});

describe("unsaved-upload sweep scheduling", () => {
  it("sweeps the vendor's folder after a successful booth save", async () => {
    const res = await saveBooth(makeBooth());
    expect(res.success).toBe(true);
    expect(sweepUnsavedUploadsMock).toHaveBeenCalledTimes(1);
    expect(sweepUnsavedUploadsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "v1" }),
    );
  });

  it("does not sweep when the booth save fails", async () => {
    h.state.insertResult = { data: null, error: { message: "boom" } };
    const res = await saveBooth(makeBooth());
    expect(res.success).toBe(false);
    expect(sweepUnsavedUploadsMock).not.toHaveBeenCalled();
  });

  it("sweeps after a successful menu save, not after a rejected one", async () => {
    h.state.prevResult = { data: { menu_items: [] } };
    expect((await saveMenuItems(BOOTH_ID, [makeItem()])).success).toBe(true);
    expect(sweepUnsavedUploadsMock).toHaveBeenCalledTimes(1);

    sweepUnsavedUploadsMock.mockClear();
    h.state.updateResult = { data: null, error: { message: "boom" } };
    expect((await saveMenuItems(BOOTH_ID, [makeItem()])).success).toBe(false);
    expect(sweepUnsavedUploadsMock).not.toHaveBeenCalled();
  });
});

describe("saveBooth entitlement enforcement", () => {
  it("(c) silently strips hours on a free-plan save", async () => {
    const input = makeBooth({
      hours: { mode: "daily", open: "09:00", close: "17:00" },
    });
    // Sanity: the input really did carry the field we expect to be dropped.
    expect(input.hours).not.toBeNull();

    const res = await saveBooth(input);

    expect(res).toEqual({ success: true, boothId: "b-new" });
    expect(h.insertSpy).toHaveBeenCalledTimes(1);
    const row = h.insertSpy.mock.calls[0][0] as {
      hours: unknown;
      vendor_id: string;
    };
    expect(row.hours).toBeNull();
    expect(row.vendor_id).toBe("v1");
  });

  it("strips the booth's daily total on a plan without stock caps, keeps the per-order limit", async () => {
    const res = await saveBooth(
      makeBooth({ daily_cup_cap: 200, max_items_per_order: 4 }),
    );

    expect(res.success).toBe(true);
    const row = h.insertSpy.mock.calls[0][0] as {
      daily_cup_cap: unknown;
      max_items_per_order: unknown;
    };
    expect(row.daily_cup_cap).toBeNull();
    expect(row.max_items_per_order).toBe(4);
  });

  it("leaves a stored daily total alone when editing on a plan without stock caps", async () => {
    await saveBooth(makeBooth({ boothId: BOOTH_ID, daily_cup_cap: 200 }));

    const row = h.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    // Not nulled and not rewritten: the key is absent, so the stored value stays.
    expect(row).not.toHaveProperty("daily_cup_cap");
  });

  it("lets a plan without stock caps remove a stored daily total", async () => {
    await saveBooth(makeBooth({ boothId: BOOTH_ID, daily_cup_cap: null }));

    const row = h.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.daily_cup_cap).toBeNull();
  });

  it("saves the booth's daily total on a plan with stock caps", async () => {
    h.loadEntitlementMock.mockResolvedValue({
      user: { id: "v1" },
      entitlement: { ...ENTITLEMENTS.free, stockCaps: true },
    });
    await saveBooth(makeBooth({ daily_cup_cap: 200 }));

    const row = h.insertSpy.mock.calls[0][0] as { daily_cup_cap: unknown };
    expect(row.daily_cup_cap).toBe(200);
  });

  it("(d) rejects activating a 2nd booth when one active booth already exists", async () => {
    h.state.count = 1; // one OTHER active booth
    const res = await saveBooth(makeBooth({ is_active: true }));

    expect(res).toEqual({
      success: false,
      error:
        "Your plan serves 1 open booth at a time. Pause another booth first, or upgrade.",
    });
    expect(h.insertSpy).not.toHaveBeenCalled();
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("(e) allows re-activating the SAME booth being edited (excluded via neq)", async () => {
    // The only active booth is this one — the query excludes it, so count is 0.
    h.state.count = 0;
    const res = await saveBooth(
      makeBooth({ boothId: BOOTH_ID, is_active: true }),
    );

    expect(res).toEqual({ success: true, boothId: "b-edit" });
    expect(h.neqSpy).toHaveBeenCalledWith("id", BOOTH_ID);
    expect(h.updateSpy).toHaveBeenCalledTimes(1);
    expect(h.insertSpy).not.toHaveBeenCalled();
  });

  it("(f) passes social_links through to the row untouched", async () => {
    const socialLinks = { instagram: "https://instagram.com/booth" };
    const res = await saveBooth(makeBooth({ social_links: socialLinks }));

    expect(res).toEqual({ success: true, boothId: "b-new" });
    const row = h.insertSpy.mock.calls[0][0] as { social_links: unknown };
    expect(row.social_links).toEqual(socialLinks);
  });
});

describe("saveMenuItems", () => {
  beforeEach(() => {
    h.state.prevResult = { data: { menu_items: [] } };
  });

  it("rejects an invalid booth id without any DB calls", async () => {
    const res = await saveMenuItems("not-a-uuid", [makeItem()]);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed item data before any DB write", async () => {
    const res = await saveMenuItems(BOOTH_ID, [
      { id: "i1", name: "", description: "", available: true },
    ]);
    expect(res).toEqual({ success: false, error: "Invalid menu items" });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("rejects a menu over the item cap before any DB write", async () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      makeItem({ id: `i${i}`, name: `Item ${i}` }),
    );
    const res = await saveMenuItems(BOOTH_ID, items);

    expect(res).toEqual({
      success: false,
      error: "Your plan allows up to 6 menu items. Remove some or upgrade.",
    });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("rejects an item over the option-group cap before any DB write", async () => {
    const option_groups = Array.from({ length: 4 }, (_, i) => ({
      id: `g${i}`,
      label: `Group ${i}`,
      choices: [{ id: "c", label: "Choice" }],
    }));
    const res = await saveMenuItems(BOOTH_ID, [makeItem({ option_groups })]);

    expect(res).toEqual({
      success: false,
      error:
        "Your plan allows up to 3 customization groups per item. Upgrade for more.",
    });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("strips per-item stock on a free-plan save", async () => {
    const res = await saveMenuItems(BOOTH_ID, [makeItem({ stock: 10 })]);

    expect(res).toEqual({ success: true });
    expect(h.updateSpy).toHaveBeenCalledTimes(1);
    const row = h.updateSpy.mock.calls[0]![0] as {
      menu_items: Array<Record<string, unknown>>;
    };
    expect(row.menu_items[0]).not.toHaveProperty("stock");
  });

  it("keeps per-item stock on a plan with stock-cap entitlement", async () => {
    h.loadEntitlementMock.mockResolvedValue({
      user: { id: "v1" },
      entitlement: ENTITLEMENTS.pro,
    });
    const res = await saveMenuItems(BOOTH_ID, [makeItem({ stock: 10 })]);

    expect(res).toEqual({ success: true });
    const row = h.updateSpy.mock.calls[0]![0] as {
      menu_items: Array<Record<string, unknown>>;
    };
    expect(row.menu_items[0]).toHaveProperty("stock", 10);
  });

  it("returns 'Booth not found' when the booth doesn't exist or isn't owned", async () => {
    h.state.prevResult = { data: null };
    const res = await saveMenuItems(BOOTH_ID, [makeItem()]);
    expect(res).toEqual({ success: false, error: "Booth not found" });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("returns an error when the update matches no row", async () => {
    h.state.updateResult = { data: null, error: null };
    const res = await saveMenuItems(BOOTH_ID, [makeItem()]);
    expect(res).toEqual({ success: false, error: "Could not save menu" });
  });
});

describe("saveMenuCategories", () => {
  it("rejects an invalid booth id without any DB calls", async () => {
    const res = await saveMenuCategories("not-a-uuid", [
      { id: "c1", label: "Drinks" },
    ]);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed category data before any DB write", async () => {
    const res = await saveMenuCategories(BOOTH_ID, [
      { id: "c1", label: "" } as { id: string; label: string },
    ]);
    expect(res).toEqual({ success: false, error: "Invalid categories" });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("writes the category list to booths.menu_categories", async () => {
    const categories = [
      { id: "c1", label: "Drinks" },
      { id: "c2", label: "Snacks" },
    ];
    const res = await saveMenuCategories(BOOTH_ID, categories);

    expect(res).toEqual({ success: true });
    expect(h.updateSpy).toHaveBeenCalledTimes(1);
    expect(h.updateSpy).toHaveBeenCalledWith({ menu_categories: categories });
  });

  it("returns an error when the update matches no row", async () => {
    h.state.updateResult = { data: null, error: null };
    const res = await saveMenuCategories(BOOTH_ID, [
      { id: "c1", label: "Drinks" },
    ]);
    expect(res).toEqual({
      success: false,
      error: "Could not save categories",
    });
  });
});

describe("saveBooth — payment marker", () => {
  const EDIT = "00000000-0000-4000-8000-000000000009";

  function insertedRow() {
    return h.insertSpy.mock.calls[0][0] as Record<string, unknown>;
  }
  function updatedRow() {
    return h.updateSpy.mock.calls[0][0] as Record<string, unknown>;
  }

  it.each([
    ["PayNow", { state: "paynow", name: "Cart" }, { kind: "paynow" }],
    ["a payment link", { state: "link", name: "Pay" }, { kind: "pointer" }],
    ["a QR image", { state: "image", name: "Pay" }, { kind: "pointer" }],
  ] as const)(
    "with the switch on, stores the kind paykit holds for %s",
    async (_, setup, marker) => {
      vendorPaymentSetupMock.mockResolvedValue(setup);

      const res = await saveBooth(makeBooth({ takes_payment: true }));

      expect(res).toEqual({ success: true, boothId: "b-new" });
      expect(vendorPaymentSetupMock).toHaveBeenCalledWith("v1");
      expect(insertedRow().payment).toEqual(marker);
    },
  );

  it("with the switch off, stores no payment and does not ask paykit", async () => {
    const res = await saveBooth(makeBooth({ takes_payment: false }));

    expect(res.success).toBe(true);
    expect(vendorPaymentSetupMock).not.toHaveBeenCalled();
    expect(insertedRow().payment).toBeNull();
  });

  it("with the switch on and nothing on file in paykit, stores no payment", async () => {
    vendorPaymentSetupMock.mockResolvedValue({ state: "none" });

    await saveBooth(makeBooth({ boothId: EDIT, takes_payment: true }));

    expect(updatedRow().payment).toBeNull();
  });

  it("replaces a stored kind that paykit no longer holds", async () => {
    h.state.prevResult = { data: { image_url: null, menu_items: [] } };
    vendorPaymentSetupMock.mockResolvedValue({ state: "link", name: "Pay" });

    await saveBooth(makeBooth({ boothId: EDIT, takes_payment: true }));

    expect(updatedRow().payment).toEqual({ kind: "pointer" });
  });

  it("keeps the stored marker and still saves the booth when paykit cannot be reached", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vendorPaymentSetupMock.mockResolvedValue({ state: "unreachable" });

    const res = await saveBooth(
      makeBooth({ boothId: EDIT, name: "Renamed", takes_payment: true }),
    );

    expect(res).toEqual({ success: true, boothId: "b-edit" });
    const row = updatedRow();
    expect(row.name).toBe("Renamed");
    expect(row).not.toHaveProperty("payment");
    logged.mockRestore();
  });

  it("creates a booth with no marker of its own when paykit cannot be reached", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vendorPaymentSetupMock.mockResolvedValue({ state: "unreachable" });

    const res = await saveBooth(makeBooth({ takes_payment: true }));

    expect(res).toEqual({ success: true, boothId: "b-new" });
    expect(insertedRow()).not.toHaveProperty("payment");
    logged.mockRestore();
  });

  it("stores nothing a caller sends in place of the switch", async () => {
    const forged = {
      ...makeBooth(),
      payment: { kind: "paynow", payee_name: "Someone else" },
    } as BoothFormInput;

    await saveBooth(forged);

    expect(vendorPaymentSetupMock).not.toHaveBeenCalled();
    expect(insertedRow().payment).toBeNull();
  });
});

describe("saveBooth — unsaved upload cleanup", () => {
  const PUBLIC = "https://abc.supabase.co/storage/v1/object/public";
  const BANNER = `${PUBLIC}/booth-images/v1/banner.webp`;

  it("deletes nothing when the save succeeds", async () => {
    const res = await saveBooth(makeBooth({ image_url: BANNER }), [BANNER]);
    expect(res.success).toBe(true);
    expect(h.removeSpy).not.toHaveBeenCalled();
  });

  it("deletes the fresh upload when the booth write fails", async () => {
    h.state.insertResult = { data: null, error: { message: "boom" } };
    const res = await saveBooth(makeBooth({ image_url: BANNER }), [BANNER]);
    expect(res.success).toBe(false);
    expect(h.removeSpy).toHaveBeenCalledWith("booth-images", [
      "v1/banner.webp",
    ]);
  });

  it("deletes fresh uploads when validation fails", async () => {
    const res = await saveBooth(makeBooth({ name: "" }), [BANNER]);
    expect(res.success).toBe(false);
    expect(h.removeSpy).toHaveBeenCalledWith("booth-images", [
      "v1/banner.webp",
    ]);
  });

  it("never deletes outside the vendor's own booth-images folder", async () => {
    h.state.insertResult = { data: null, error: { message: "boom" } };
    await saveBooth(makeBooth(), [
      `${PUBLIC}/booth-images/v2/theirs.webp`,
      `${PUBLIC}/vendor-images/v1/other-bucket.webp`,
      "https://example.com/x.webp",
    ]);
    expect(h.removeSpy).not.toHaveBeenCalled();
  });

  it("ignores a malformed fresh-upload list", async () => {
    h.state.insertResult = { data: null, error: { message: "boom" } };
    await saveBooth(makeBooth(), "not-a-list" as unknown as string[]);
    expect(h.removeSpy).not.toHaveBeenCalled();
  });
});

describe("saveBooth — requires_arrival_confirm", () => {
  it("passes the arrival-confirm flag through to the stored row", async () => {
    await saveBooth(makeBooth({ requires_arrival_confirm: true }));
    expect(h.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requires_arrival_confirm: true }),
    );
  });

  it("defaults to false when omitted", async () => {
    await saveBooth(makeBooth());
    expect(h.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requires_arrival_confirm: false }),
    );
  });
});

describe("saveBooth — self-checkout pickup", () => {
  it("persists pickup_scan_enabled on the booth row", async () => {
    await saveBooth(makeBooth({ pickup_scan_enabled: true }));
    expect(h.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pickup_scan_enabled: true }),
    );
  });
});

describe("saveBooth — printkit location registration", () => {
  it("persists print_enabled on the row", async () => {
    await saveBooth(makeBooth({ print_enabled: true }));
    expect(h.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ print_enabled: true }),
    );
  });

  it("registers the location as active when print_enabled is true", async () => {
    const res = await saveBooth(
      makeBooth({ name: "Kopitiam Cart", print_enabled: true }),
    );

    expect(res).toEqual({ success: true, boothId: "b-new" });
    expect(registerPrintLocationMock).toHaveBeenCalledWith({
      vendorId: "v1",
      sourceRef: "b-new",
      label: "Kopitiam Cart",
      active: true,
    });
  });

  it("registers the location as inactive when print_enabled is false", async () => {
    const res = await saveBooth(
      makeBooth({ name: "Kopitiam Cart", print_enabled: false }),
    );

    expect(res).toEqual({ success: true, boothId: "b-new" });
    expect(registerPrintLocationMock).toHaveBeenCalledWith({
      vendorId: "v1",
      sourceRef: "b-new",
      label: "Kopitiam Cart",
      active: false,
    });
  });

  it("never fails the save when registerPrintLocation rejects", async () => {
    registerPrintLocationMock.mockRejectedValue(new Error("network down"));

    const res = await saveBooth(makeBooth({ print_enabled: true }));

    expect(res).toEqual({ success: true, boothId: "b-new" });
  });

  it("never fails the save when registerPrintLocation returns ok:false", async () => {
    registerPrintLocationMock.mockResolvedValue({
      ok: false,
      status: 500,
      error: "printkit unreachable",
    });

    const res = await saveBooth(makeBooth({ print_enabled: true }));

    expect(res).toEqual({ success: true, boothId: "b-new" });
  });

  it("stores nothing from printkit's answer on the booth row", async () => {
    registerPrintLocationMock.mockResolvedValue({
      ok: true,
      data: { id: "loc-42" },
    });

    const res = await saveBooth(
      makeBooth({ boothId: BOOTH_ID, print_enabled: true }),
    );

    expect(res).toEqual({ success: true, boothId: "b-edit" });
    expect(registerPrintLocationMock).toHaveBeenCalled();
    expect(h.updateSpy).toHaveBeenCalledTimes(1);
    expect(h.updateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ printkit_location_id: expect.anything() }),
    );
  });
});

describe("deleteBooth — printkit location deregistration", () => {
  beforeEach(() => {
    h.state.prevResult = {
      data: { name: "Kopitiam Cart", image_url: null, menu_items: [] },
    };
  });

  it("deregisters the printkit location (active:false) after a successful delete", async () => {
    const res = await deleteBooth(BOOTH_ID);

    expect(res).toEqual({ success: true });
    expect(registerPrintLocationMock).toHaveBeenCalledWith({
      vendorId: "v1",
      sourceRef: BOOTH_ID,
      label: "Kopitiam Cart",
      active: false,
    });
  });

  it("never fails the delete when registerPrintLocation rejects", async () => {
    registerPrintLocationMock.mockRejectedValue(new Error("network down"));

    const res = await deleteBooth(BOOTH_ID);

    expect(res).toEqual({ success: true });
  });

  it("never fails the delete when registerPrintLocation returns ok:false", async () => {
    registerPrintLocationMock.mockResolvedValue({
      ok: false,
      status: 500,
      error: "printkit unreachable",
    });

    const res = await deleteBooth(BOOTH_ID);

    expect(res).toEqual({ success: true });
  });
});

describe("toggleBoothActive", () => {
  it("preserves a completed deletion when storage cleanup throws", async () => {
    h.state.prevResult = {
      data: {
        name: "Cart",
        image_url:
          "https://project.supabase.co/storage/v1/object/public/booth-images/v1/banner.webp",
        menu_items: [],
      },
    };
    h.removeSpy.mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const result = await deleteBooth(BOOTH_ID);
    expect(h.removeSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
  it("rejects a truthy non-boolean before checking entitlement or writing", async () => {
    h.loadEntitlementMock.mockClear();
    const result = await toggleBoothActive(
      BOOTH_ID,
      "false" as unknown as boolean,
    );
    expect(result.success).toBe(false);
    expect(h.loadEntitlementMock).not.toHaveBeenCalled();
    expect(h.updateSpy).not.toHaveBeenCalled();
  });
  it("rejects an invalid booth id without any DB calls", async () => {
    const res = await toggleBoothActive("not-a-uuid", true);
    expect(res).toEqual({ success: false, error: "Invalid booth" });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("always allows turning off, no active-cap check", async () => {
    h.state.count = 5; // would fail the cap if it were checked
    const res = await toggleBoothActive(BOOTH_ID, false);

    expect(res).toEqual({ success: true });
    expect(h.updateSpy).toHaveBeenCalledWith({ is_active: false });
  });

  it("rejects turning on when the active-booth cap is already reached", async () => {
    h.state.count = 1; // one OTHER active booth, free plan caps at 1
    const res = await toggleBoothActive(BOOTH_ID, true);

    expect(res).toEqual({
      success: false,
      error:
        "Your plan serves 1 open booth at a time. Pause another booth first, or upgrade.",
    });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("allows turning on when under the active-booth cap, excluding itself via neq", async () => {
    h.state.count = 0;
    const res = await toggleBoothActive(BOOTH_ID, true);

    expect(res).toEqual({ success: true });
    expect(h.neqSpy).toHaveBeenCalledWith("id", BOOTH_ID);
    expect(h.updateSpy).toHaveBeenCalledWith({ is_active: true });
  });
});
