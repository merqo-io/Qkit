// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeToPush, vapidKeyBytes } from "./client";

const JSON_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "p", auth: "a" },
};

function installPush({
  existing = null as unknown,
  subscribe = vi.fn(async () => ({ toJSON: () => JSON_SUB })),
  registration = true,
  active = true,
  ready = undefined as Promise<unknown> | undefined,
} = {}) {
  const pushManager = {
    getSubscription: vi.fn(async () => existing),
    subscribe,
  };
  const reg = registration
    ? { pushManager, active: active ? {} : null }
    : undefined;
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => reg),
      ready: ready ?? Promise.resolve({ pushManager, active: {} }),
    },
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { permission: "granted" });
  return pushManager;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AQID");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("vapidKeyBytes", () => {
  it("decodes base64url", () => {
    expect(Array.from(vapidKeyBytes("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(vapidKeyBytes("-_8"))).toEqual([251, 255]);
  });
});

describe("subscribeToPush", () => {
  it("subscribes with the VAPID key and returns the JSON subscription", async () => {
    const pm = installPush();
    await expect(subscribeToPush()).resolves.toEqual(JSON_SUB);
    expect(pm.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
  });

  it("reuses an existing subscription", async () => {
    const pm = installPush({ existing: { toJSON: () => JSON_SUB } });
    await expect(subscribeToPush()).resolves.toEqual(JSON_SUB);
    expect(pm.subscribe).not.toHaveBeenCalled();
  });

  it("returns null without the public key", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    const pm = installPush();
    await expect(subscribeToPush()).resolves.toBeNull();
    expect(pm.subscribe).not.toHaveBeenCalled();
  });

  it("returns null when permission is not granted", async () => {
    const pm = installPush();
    vi.stubGlobal("Notification", { permission: "default" });
    await expect(subscribeToPush()).resolves.toBeNull();
    expect(pm.subscribe).not.toHaveBeenCalled();
  });

  it("returns null where the Push API is missing (iOS Safari tab)", async () => {
    installPush();
    vi.stubGlobal("PushManager", undefined);
    Reflect.deleteProperty(window, "PushManager");
    await expect(subscribeToPush()).resolves.toBeNull();
  });

  it("returns null when no service worker is registered", async () => {
    installPush({ registration: false });
    await expect(subscribeToPush()).resolves.toBeNull();
  });

  it("waits for a worker that is still installing", async () => {
    const pm = installPush({ active: false });
    await expect(subscribeToPush()).resolves.toEqual(JSON_SUB);
    expect(pm.subscribe).toHaveBeenCalled();
  });

  it("gives up when the worker never activates", async () => {
    vi.useFakeTimers();
    try {
      const pm = installPush({ active: false, ready: new Promise(() => {}) });
      const result = subscribeToPush();
      await vi.advanceTimersByTimeAsync(5000);
      await expect(result).resolves.toBeNull();
      expect(pm.subscribe).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null when subscribing fails", async () => {
    installPush({
      subscribe: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    await expect(subscribeToPush()).resolves.toBeNull();
  });
});
