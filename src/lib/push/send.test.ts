import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendOrderReadyPush } from "./send";

const { sendNotificationMock, fromMock, deleteEqMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  fromMock: vi.fn(),
  deleteEqMock: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: { sendNotification: sendNotificationMock },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => Promise.resolve({ from: fromMock }),
}));

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function row(id: string, endpoint: string) {
  return {
    id,
    endpoint,
    p256dh: "p256",
    auth: "auth",
    title: "Order #7 is ready",
    body: "Kopi Cart. Please collect it now.",
    url: "/order/b/7?t=tok",
    tag: "qkit-order-7",
  };
}

function mockRows(result: { data: unknown; error: unknown }) {
  fromMock.mockImplementation(() => ({
    select: () => ({ eq: () => Promise.resolve(result) }),
    delete: () => ({
      eq: (...args: unknown[]) => {
        deleteEqMock(...args);
        return Promise.resolve({ error: null });
      },
    }),
  }));
}

function pushError(statusCode: number) {
  return Object.assign(new Error(`push failed ${statusCode}`), { statusCode });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:ops@merqo.io");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("sendOrderReadyPush", () => {
  it("does nothing when VAPID keys are not configured", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    mockRows({
      data: [row("s1", "https://fcm.googleapis.com/a")],
      error: null,
    });
    await sendOrderReadyPush(ORDER_ID);
    expect(fromMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("sends the stored payload to every subscription of the order", async () => {
    mockRows({
      data: [
        row("s1", "https://fcm.googleapis.com/a"),
        row("s2", "https://web.push.apple.com/b"),
      ],
      error: null,
    });
    sendNotificationMock.mockResolvedValue({ statusCode: 201 });

    await sendOrderReadyPush(ORDER_ID);

    expect(fromMock).toHaveBeenCalledWith("order_push_subscriptions");
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    const [sub, payload, options] = sendNotificationMock.mock.calls[0];
    expect(sub).toEqual({
      endpoint: "https://fcm.googleapis.com/a",
      keys: { p256dh: "p256", auth: "auth" },
    });
    expect(JSON.parse(payload)).toEqual({
      title: "Order #7 is ready",
      body: "Kopi Cart. Please collect it now.",
      url: "/order/b/7?t=tok",
      tag: "qkit-order-7",
    });
    expect(options).toMatchObject({
      TTL: 3600,
      urgency: "high",
      vapidDetails: {
        subject: "mailto:ops@merqo.io",
        publicKey: "pub",
        privateKey: "priv",
      },
    });
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it.each([404, 410])(
    "deletes a subscription the push service reports gone (%i)",
    async (code) => {
      mockRows({
        data: [
          row("s1", "https://fcm.googleapis.com/a"),
          row("s2", "https://fcm.googleapis.com/b"),
        ],
        error: null,
      });
      sendNotificationMock
        .mockRejectedValueOnce(pushError(code))
        .mockResolvedValueOnce({ statusCode: 201 });

      await sendOrderReadyPush(ORDER_ID);

      expect(sendNotificationMock).toHaveBeenCalledTimes(2);
      expect(deleteEqMock).toHaveBeenCalledTimes(1);
      expect(deleteEqMock).toHaveBeenCalledWith("id", "s1");
    },
  );

  it("keeps the subscription and logs on any other failure", async () => {
    mockRows({
      data: [row("s1", "https://fcm.googleapis.com/a")],
      error: null,
    });
    sendNotificationMock.mockRejectedValue(pushError(500));

    await expect(sendOrderReadyPush(ORDER_ID)).resolves.toBeUndefined();

    expect(deleteEqMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("never throws when the read fails", async () => {
    mockRows({ data: null, error: { message: "db down" } });
    await expect(sendOrderReadyPush(ORDER_ID)).resolves.toBeUndefined();
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("never throws when the client itself throws", async () => {
    fromMock.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(sendOrderReadyPush(ORDER_ID)).resolves.toBeUndefined();
  });
});
