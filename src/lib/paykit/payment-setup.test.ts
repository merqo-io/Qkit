import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupKind, vendorPaymentSetup } from "./payment-setup";
import { getVendorConfig, type VendorConfigFull } from "./client";

vi.mock("./client", () => ({ getVendorConfig: vi.fn() }));

const EMPTY: VendorConfigFull = {
  hasConfig: false,
  displayName: null,
  kind: null,
  payeeName: null,
  uen: null,
  mobile: null,
  label: null,
  url: null,
  qrImageUrl: null,
};

function paykitHolds(config: Partial<VendorConfigFull>) {
  vi.mocked(getVendorConfig).mockResolvedValue({
    ok: true,
    data: { ...EMPTY, hasConfig: true, ...config },
  });
}

beforeEach(() => {
  vi.mocked(getVendorConfig).mockReset();
});

describe("vendorPaymentSetup", () => {
  it("asks paykit about this vendor", async () => {
    paykitHolds({ kind: "paynow", payeeName: "Cart" });

    await vendorPaymentSetup("v1");

    expect(getVendorConfig).toHaveBeenCalledWith("v1");
  });

  it.each([
    [
      "a PayNow config",
      { kind: "paynow", payeeName: "Kopitiam Cart", uen: "53312345A" },
      { state: "paynow", name: "Kopitiam Cart" },
    ],
    [
      "a PayNow config with no payee name",
      { kind: "paynow", mobile: "+6591234567" },
      { state: "paynow", name: "" },
    ],
    [
      "a payment link",
      { kind: "pointer", label: "Pay with PayLah", url: "https://pay.example" },
      { state: "link", name: "Pay with PayLah" },
    ],
    [
      "a QR image",
      {
        kind: "pointer",
        label: "GrabPay",
        qrImageUrl: "https://img.example/qr.webp",
      },
      { state: "image", name: "GrabPay" },
    ],
    [
      "a pointer with neither a link nor an image",
      { kind: "pointer", label: "Half set up" },
      { state: "none" },
    ],
    ["a config of no known kind", { kind: null }, { state: "none" }],
  ] as const)("reads %s", async (_, config, expected) => {
    paykitHolds(config);

    expect(await vendorPaymentSetup("v1")).toEqual(expected);
  });

  it("reads a vendor with nothing saved as none", async () => {
    vi.mocked(getVendorConfig).mockResolvedValue({ ok: true, data: EMPTY });

    expect(await vendorPaymentSetup("v1")).toEqual({ state: "none" });
  });

  it("carries no payment identifier, only the kind and its display name", async () => {
    paykitHolds({
      kind: "paynow",
      payeeName: "Cart",
      uen: "53312345A",
      mobile: "+6591234567",
    });

    expect(Object.keys(await vendorPaymentSetup("v1")).sort()).toEqual([
      "name",
      "state",
    ]);
  });

  it("reads a failed call as unreachable, not as nothing on file", async () => {
    vi.mocked(getVendorConfig).mockResolvedValue({
      ok: false,
      status: null,
      error: "Could not reach paykit",
    });

    expect(await vendorPaymentSetup("v1")).toEqual({ state: "unreachable" });
  });
});

describe("setupKind", () => {
  it.each([
    [{ state: "paynow", name: "Cart" }, "paynow"],
    [{ state: "link", name: "Pay" }, "pointer"],
    [{ state: "image", name: "Pay" }, "pointer"],
    [{ state: "none" }, null],
    [{ state: "unreachable" }, null],
  ] as const)("maps %j to %s", (setup, expected) => {
    expect(setupKind(setup)).toBe(expected);
  });
});
