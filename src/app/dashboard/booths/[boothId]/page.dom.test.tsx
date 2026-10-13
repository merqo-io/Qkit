// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ENTITLEMENTS } from "@/lib/plan";
const { gate, booth, from, filter, config, booking, form } = vi.hoisted(() => ({
  gate: vi.fn(),
  booth: { current: {} as Record<string, unknown> | null },
  from: vi.fn(),
  filter: vi.fn(),
  config: vi.fn(),
  booking: vi.fn(),
  form: vi.fn(),
}));
vi.mock("@/lib/supabase/get-entitlement", () => ({
  requireEntitledVendor: gate,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from }),
}));
vi.mock("@/lib/paykit/client", () => ({
  getVendorConfig: config,
  getBookingStatus: booking,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("../booth-form", () => ({
  BoothForm: (props: unknown) => {
    form(props);
    return null;
  },
}));
import EditBoothPage from "./page";
const page = () =>
  EditBoothPage({ params: Promise.resolve({ boothId: "booth-a" }) });
beforeEach(() => {
  vi.clearAllMocks();
  gate.mockResolvedValue({
    vendor: { id: "vendor-a", social_links: {} },
    entitlement: ENTITLEMENTS.free,
  });
  booth.current = {
    id: "booth-a",
    name: "Coffee",
    menu_items: [],
    payment: null,
    hours: null,
    social_links: null,
    paykit_booking_id: null,
  };
  config.mockResolvedValue({ ok: false });
  booking.mockResolvedValue({ ok: false });
  from.mockReturnValue({
    select: () => ({
      eq: (column: string, value: string) => {
        filter(column, value);
        return { maybeSingle: async () => ({ data: booth.current }) };
      },
    }),
  });
});

describe("booth editor data boundary", () => {
  it("requires a vendor before fetching booth or payment configuration", async () => {
    gate.mockRejectedValue(new Error("Denied"));
    await expect(page()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
    expect(config).not.toHaveBeenCalled();
  });
  it("does not fetch private payment configuration for an RLS-hidden booth", async () => {
    booth.current = null;
    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(config).not.toHaveBeenCalled();
    expect(booking).not.toHaveBeenCalled();
  });
  it.each([
    [null, false],
    [{ kind: "paynow" }, true],
    [{ kind: "pointer" }, true],
    [{ kind: "paynow", payee_name: "Cart", uen: "123456789A" }, true],
    [{ kind: "stripe" }, false],
    [{ kind: "unknown" }, false],
  ])(
    "reads the booth's own marker %j as its switch when paykit is unavailable",
    async (payment, takesPayment) => {
      booth.current = { ...booth.current, payment };
      render(await page());
      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentSetup: { state: "unreachable" },
          initial: expect.objectContaining({
            takes_payment: takesPayment,
            bookingStatus: null,
            menuItemCount: 0,
          }),
        }),
      );
      expect(config).toHaveBeenCalledWith("vendor-a");
      expect(booking).not.toHaveBeenCalled();
      expect(filter).toHaveBeenCalledWith("id", "booth-a");
    },
  );
  it.each([
    [
      { kind: "paynow", payeeName: "Coffee", uen: "123456789A" },
      { state: "paynow", name: "Coffee" },
    ],
    [
      { kind: "pointer", label: "Pay here", url: "https://pay.example" },
      { state: "link", name: "Pay here" },
    ],
    [
      {
        kind: "pointer",
        label: "Pay here",
        qrImageUrl: "https://pay.example/qr.png",
      },
      { state: "image", name: "Pay here" },
    ],
    [{ hasConfig: false }, { state: "none" }],
  ])(
    "hands the form what paykit holds %j, with no payment identifier",
    async (data, setup) => {
      config.mockResolvedValue({
        ok: true,
        data: { hasConfig: true, ...data },
      });
      render(await page());
      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({ paymentSetup: setup }),
      );
      expect(JSON.stringify(form.mock.calls[0][0])).not.toContain("123456789A");
    },
  );
  it.each(["paynow", "pointer"])(
    "does not switch booth payment on merely because the vendor has a %s setup",
    async (kind) => {
      config.mockResolvedValue({
        ok: true,
        data: {
          hasConfig: true,
          kind,
          payeeName: "Cart",
          label: "Pay",
          url: "https://pay.example",
        },
      });
      render(await page());
      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: expect.objectContaining({ takes_payment: false }),
        }),
      );
    },
  );
  it.each([true, false])(
    "shows booking status only when its lookup succeeds: %s",
    async (ok) => {
      booth.current = {
        ...booth.current,
        paykit_booking_id: "booking-a",
        social_links: {},
      };
      booking.mockResolvedValue({
        ok,
        data: { id: "booking-a", status: "confirmed" },
      });
      render(await page());
      expect(booking).toHaveBeenCalledWith("booking-a");
      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          initial: expect.objectContaining({
            bookingStatus: ok ? { id: "booking-a", status: "confirmed" } : null,
          }),
        }),
      );
    },
  );
});
