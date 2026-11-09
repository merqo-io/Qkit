import { describe, expect, expectTypeOf, it } from "vitest";

import { fail, ok, type ActionResult } from "./action-result";

describe("ok", () => {
  it("returns a bare success when no data is given", () => {
    expect(ok()).toStrictEqual({ success: true });
  });

  it("spreads the payload next to success", () => {
    expect(ok({ boothId: "b1", status: "ready" })).toStrictEqual({
      success: true,
      boothId: "b1",
      status: "ready",
    });
  });

  it("keeps success true even if the payload tries to override it", () => {
    const result = ok({ success: false } as object);
    expect(result.success).toBe(true);
  });

  it("is assignable to the matching ActionResult", () => {
    const bare: ActionResult = ok();
    const withData: ActionResult<{ boothId: string }> = ok({ boothId: "b1" });
    expectTypeOf(bare).toEqualTypeOf<ActionResult>();
    expect(withData.success).toBe(true);
    expectTypeOf(ok({ boothId: "b1" })).toExtend<{
      success: true;
      boothId: string;
    }>();
  });
});

describe("fail", () => {
  it("returns the failure branch with the message", () => {
    expect(fail("Nope")).toStrictEqual({ success: false, error: "Nope" });
  });

  it("is assignable to any ActionResult", () => {
    const result: ActionResult<{ orderNumber: number }> = fail("Nope");
    expect(result.success).toBe(false);
    expectTypeOf(fail("x")).toEqualTypeOf<{
      success: false;
      error: string;
    }>();
  });
});
