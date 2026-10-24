import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, pushSubscriptionSchema } from "./subscription";

// Fake, low-entropy values in the real lengths (87 and 22 base64url chars).
const KEYS = {
  p256dh:
    "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  auth: "AAAAAAAAAAAAAAAAAAAAAA",
};

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QAbc",
  ])("allows %s", (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://evil.example/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example/x",
    "https://push.apple.com.evil.example/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://169.254.169.254/latest",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false);
  });
});

describe("pushSubscriptionSchema", () => {
  it("accepts a browser subscription and drops extra fields", () => {
    const parsed = pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      expirationTime: null,
      keys: KEYS,
    });
    expect(parsed.success && parsed.data).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: KEYS,
    });
  });

  it("rejects a foreign endpoint", () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "https://evil.example/x",
        keys: KEYS,
      }).success,
    ).toBe(false);
  });

  it.each([
    { ...KEYS, p256dh: "not base64url!" },
    { ...KEYS, auth: "" },
    { ...KEYS, auth: "a".repeat(65) },
    { p256dh: KEYS.p256dh },
  ])("rejects bad keys %#", (keys) => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys,
      }).success,
    ).toBe(false);
  });

  it("rejects an oversized endpoint", () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: `https://fcm.googleapis.com/${"a".repeat(1100)}`,
        keys: KEYS,
      }).success,
    ).toBe(false);
  });
});
