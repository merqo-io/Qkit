import { describe, it, expect, vi, beforeEach } from "vitest";

// submitFeedback runs the anti-flood check then inserts via the submit_feedback
// RPC (the feedback table has no public INSERT policy). Stub both RPCs.
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ rpc }),
  createServerClient: async () => ({ rpc }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

import { submitFeedback } from "./feedback";

beforeEach(() => {
  rpc.mockReset();
});

function allow() {
  rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name === "check_rate_limit") return Promise.resolve({ data: true });
    if (name === "submit_feedback") return Promise.resolve({ error: null });
    throw new Error(`unexpected rpc: ${name}(${JSON.stringify(args)})`);
  });
}

describe("submitFeedback", () => {
  it("inserts a customer rating via the submit_feedback RPC", async () => {
    allow();
    const res = await submitFeedback({ source: "customer", rating: 5 });
    expect(res).toEqual({ success: true });

    const call = rpc.mock.calls.find((c) => c[0] === "submit_feedback");
    expect(call?.[1]).toMatchObject({ p_source: "customer", p_rating: 5 });
  });

  it("threads the order access token through for customer feedback", async () => {
    allow();
    const res = await submitFeedback({
      source: "customer",
      boothId: "11111111-1111-1111-8111-111111111111",
      orderNumber: "0042",
      token: "22222222-2222-2222-8222-222222222222",
      rating: 5,
    });
    expect(res).toEqual({ success: true });

    const call = rpc.mock.calls.find((c) => c[0] === "submit_feedback");
    expect(call?.[1]).toMatchObject({
      p_access_token: "22222222-2222-2222-8222-222222222222",
    });
  });

  it("passes source=vendor through so the RPC can stamp the caller's id", async () => {
    allow();
    const res = await submitFeedback({ source: "vendor", nps: 9 });
    expect(res).toEqual({ success: true });

    const call = rpc.mock.calls.find((c) => c[0] === "submit_feedback");
    expect(call?.[1]).toMatchObject({ p_source: "vendor", p_nps: 9 });
  });

  it("rejects an empty submission at the schema before any RPC", async () => {
    allow();
    const res = await submitFeedback({ source: "customer" });
    expect(res).toEqual({ success: false, error: "Add a rating or a message" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the throttle message when the limiter denies", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "check_rate_limit") return Promise.resolve({ data: false });
      throw new Error(`unexpected rpc: ${name}`);
    });
    const res = await submitFeedback({ source: "customer", rating: 4 });
    expect(res).toEqual({
      success: false,
      error: "Thanks, you've already sent feedback.",
    });
  });

  it("surfaces a generic error when the insert RPC fails", async () => {
    rpc.mockImplementation((name: string) => {
      if (name === "check_rate_limit") return Promise.resolve({ data: true });
      if (name === "submit_feedback")
        return Promise.resolve({ error: { message: "boom" } });
      throw new Error(`unexpected rpc: ${name}`);
    });
    const res = await submitFeedback({ source: "customer", rating: 3 });
    expect(res).toEqual({ success: false, error: "Could not send feedback" });
  });
});
