import { describe, expect, it } from "vitest";
import { expectsPayment, paymentKindOf, paymentMarker } from "./payment-marker";

describe("paymentKindOf", () => {
  it.each(["paynow", "pointer"] as const)(
    "reads the %s kind off a bare marker",
    (kind) => {
      expect(paymentKindOf({ kind })).toBe(kind);
    },
  );

  it("reads the kind off a full config as well as a bare marker", () => {
    expect(paymentKindOf({ kind: "paynow", payee_name: "Cart" })).toBe(
      "paynow",
    );
  });

  it.each([
    null,
    undefined,
    {},
    { kind: "cash" },
    { kind: "stripe" },
    { kind: 1 },
    "paynow",
    [],
  ])("reads %j as no payment", (data) => {
    expect(paymentKindOf(data)).toBeNull();
  });
});

describe("expectsPayment", () => {
  it("is true for the two kinds", () => {
    expect(expectsPayment("paynow")).toBe(true);
    expect(expectsPayment("pointer")).toBe(true);
  });

  it("is false for no payment", () => {
    expect(expectsPayment(null)).toBe(false);
  });
});

describe("paymentMarker", () => {
  it("stores the two kinds", () => {
    expect(paymentMarker("paynow")).toEqual({ kind: "paynow" });
    expect(paymentMarker("pointer")).toEqual({ kind: "pointer" });
  });

  it("stores nothing for no payment", () => {
    expect(paymentMarker(null)).toBeNull();
  });

  it("round-trips through paymentKindOf", () => {
    expect(paymentKindOf(paymentMarker("pointer"))).toBe("pointer");
    expect(paymentKindOf(paymentMarker(null))).toBeNull();
  });
});
