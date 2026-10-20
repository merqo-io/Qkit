import { beforeEach, describe, expect, it, vi } from "vitest";
import { savePushSubscription } from "./push-actions";

const { fromMock, upsertMock, rateLimitMock, resolveDisplayMock } = vi.hoisted(
  () => ({
    fromMock: vi.fn(),
    upsertMock: vi.fn(),
    rateLimitMock: vi.fn(),
    resolveDisplayMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => Promise.resolve({ from: fromMock }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));
vi.mock("@/lib/order-display", () => ({
  resolveOrderDisplay: (...args: unknown[]) => resolveDisplayMock(...args),
}));

const BOOTH = "22222222-2222-4222-8222-222222222222";
const TOKEN = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";
const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: {
    p256dh:
      "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    auth: "AAAAAAAAAAAAAAAAAAAAAA",
  },
};

function readChain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.maybeSingle = () => Promise.resolve(result);
  obj.then = (resolve: (v: typeof result) => void) =>
    Promise.resolve(result).then(resolve);
  obj.upsert = (...args: unknown[]) => {
    upsertMock(...args);
    return Promise.resolve({ error: null });
  };
  return obj;
}

function setup({
  order = { id: ORDER_ID, status: "preparing" },
  existing = [] as { endpoint: string }[],
}: {
  order?: { id: string; status: string } | null;
  existing?: { endpoint: string }[];
} = {}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "orders") return readChain({ data: order, error: null });
    if (table === "booths")
      return readChain({
        data: { name: "Kopi Cart", vendor_id: "v1" },
        error: null,
      });
    return readChain({ data: existing, error: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockResolvedValue(true);
  resolveDisplayMock.mockResolvedValue("7");
});

describe("savePushSubscription", () => {
  it("saves the subscription with the server-computed ready payload", async () => {
    setup();
    const res = await savePushSubscription(BOOTH, "0042", TOKEN, SUB);
    expect(res).toEqual({ success: true });
    expect(upsertMock).toHaveBeenCalledWith(
      {
        order_id: ORDER_ID,
        endpoint: SUB.endpoint,
        p256dh: SUB.keys.p256dh,
        auth: SUB.keys.auth,
        title: "Order #7 is ready",
        body: "Kopi Cart. Please collect it now.",
        url: `/order/${BOOTH}/0042?t=${TOKEN}`,
        tag: "qkit-order-7",
      },
      { onConflict: "order_id,endpoint" },
    );
    expect(resolveDisplayMock).toHaveBeenCalledWith(
      expect.anything(),
      BOOTH,
      "v1",
      "0042",
    );
  });

  it("rejects a bad token without touching the database", async () => {
    setup();
    const res = await savePushSubscription(BOOTH, "0042", "nope", SUB);
    expect(res.success).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a subscription pointing at a foreign host", async () => {
    setup();
    const res = await savePushSubscription(BOOTH, "0042", TOKEN, {
      ...SUB,
      endpoint: "https://evil.example/x",
    });
    expect(res.success).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects when rate limited", async () => {
    setup();
    rateLimitMock.mockResolvedValue(false);
    const res = await savePushSubscription(BOOTH, "0042", TOKEN, SUB);
    expect(res.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown order (wrong token for this number)", async () => {
    setup({ order: null });
    const res = await savePushSubscription(BOOTH, "0042", TOKEN, SUB);
    expect(res.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it.each(["ready", "completed", "cancelled"])(
    "rejects an order that is no longer waiting (%s)",
    async (status) => {
      setup({ order: { id: ORDER_ID, status } });
      const res = await savePushSubscription(BOOTH, "0042", TOKEN, SUB);
      expect(res.success).toBe(false);
      expect(upsertMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a sixth browser for the same order", async () => {
    setup({
      existing: Array.from({ length: 5 }, (_, i) => ({
        endpoint: `https://fcm.googleapis.com/${i}`,
      })),
    });
    const res = await savePushSubscription(BOOTH, "0042", TOKEN, SUB);
    expect(res.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("still refreshes a browser already saved when at the cap", async () => {
    setup({
      existing: [
        ...Array.from({ length: 4 }, (_, i) => ({
          endpoint: `https://fcm.googleapis.com/${i}`,
        })),
        { endpoint: SUB.endpoint },
      ],
    });
    const res = await savePushSubscription(BOOTH, "0042", TOKEN, SUB);
    expect(res).toEqual({ success: true });
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});
