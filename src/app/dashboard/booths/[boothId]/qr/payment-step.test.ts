import { describe, expect, it } from "vitest";
import { paymentStepOf } from "./payment-step";

describe("paymentStepOf", () => {
  it.each([
    ["none", "missing"],
    ["unreachable", "unknown"],
    ["paynow", "ready"],
    ["link", "ready"],
    ["image", "ready"],
  ] as const)("maps %s to %s", (state, step) => {
    expect(paymentStepOf(state)).toBe(step);
  });
});
