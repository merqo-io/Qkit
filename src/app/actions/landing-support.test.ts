import { describe, it, expect, vi, beforeEach } from "vitest";

const { submitSupportMessageMock } = vi.hoisted(() => ({
  submitSupportMessageMock: vi.fn(),
}));

vi.mock("@/app/actions/support", () => ({
  submitSupportMessage: submitSupportMessageMock,
}));

import { submitLandingSupport } from "./landing-support";

beforeEach(() => {
  submitSupportMessageMock.mockReset();
});

describe("submitLandingSupport", () => {
  it("maps the nav's message field to the action's body field", async () => {
    submitSupportMessageMock.mockResolvedValue({ success: true });
    const res = await submitLandingSupport({
      category: "payment",
      message: "PayNow did not show",
    });
    expect(submitSupportMessageMock).toHaveBeenCalledWith({
      category: "payment",
      body: "PayNow did not show",
    });
    expect(res).toEqual({ success: true });
  });

  it("returns a failed result unchanged so the nav can throw it", async () => {
    submitSupportMessageMock.mockResolvedValue({
      success: false,
      error: "Please sign in first",
    });
    const res = await submitLandingSupport({ category: "other", message: "x" });
    expect(res).toEqual({ success: false, error: "Please sign in first" });
  });
});
