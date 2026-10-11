import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireNewOrderNotification,
  fireReadyNotification,
  isNotifySupported,
  notifyPermission,
  playReadyChime,
  playSound,
  requestNotifyPermission,
  unlockAudio,
} from "./order-alerts";

// A mock AudioContext whose calls we can assert. `state` drives the resume path.
function mockAudio(state: AudioContextState = "running") {
  const make = () => {
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
    };
    const osc = {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(() => gain),
      start: vi.fn(),
      stop: vi.fn(),
    };
    return { osc, gain };
  };
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    createOscillator: vi.fn(() => make().osc),
    createGain: vi.fn(() => make().gain),
  };
  const Ctor = vi.fn(function () {
    return ctx;
  });
  vi.stubGlobal("window", { AudioContext: Ctor });
  return { ctx, Ctor };
}

// Minimal Notification stub. The constructor records its args so we can assert
// a popup was fired; static permission/requestPermission are configurable.
function installNotification(
  permission: NotificationPermission,
  opts: { requestResult?: NotificationPermission; throwOnNew?: boolean } = {},
) {
  const ctor = vi.fn((title: string, init?: NotificationOptions) => {
    if (opts.throwOnNew) throw new Error("no service worker");
    return { title, ...init };
  }) as unknown as typeof Notification;
  Object.assign(ctor, {
    permission,
    requestPermission: vi.fn(async () => opts.requestResult ?? permission),
  });
  vi.stubGlobal("Notification", ctor);
  vi.stubGlobal("window", { Notification: ctor });
  return ctor;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notification support + permission", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when Notification is absent", () => {
    vi.stubGlobal("window", {});
    expect(isNotifySupported()).toBe(false);
    expect(notifyPermission()).toBeNull();
  });

  it("reports support + current permission when present", () => {
    installNotification("default");
    expect(isNotifySupported()).toBe(true);
    expect(notifyPermission()).toBe("default");
  });

  it("requestNotifyPermission returns null when unsupported", async () => {
    vi.stubGlobal("window", {});
    expect(await requestNotifyPermission()).toBeNull();
  });

  it("requestNotifyPermission proxies the browser result", async () => {
    installNotification("default", { requestResult: "granted" });
    expect(await requestNotifyPermission()).toBe("granted");
  });

  it("requestNotifyPermission swallows a thrown permission call", async () => {
    const ctor = installNotification("default");
    (ctor.requestPermission as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("blocked"),
    );
    expect(await requestNotifyPermission()).toBeNull();
  });
});

describe("fireReadyNotification", () => {
  it("does nothing when permission is not granted", async () => {
    const ctor = installNotification("default");
    await fireReadyNotification("Booth", "0001");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("constructs a notification when granted (no service worker)", async () => {
    const ctor = installNotification("granted");
    await fireReadyNotification("Mama's Kitchen", "0042");
    expect(ctor).toHaveBeenCalledWith(
      "Order #0042 is ready",
      expect.objectContaining({
        tag: "qkit-order-0042",
        body: "Mama's Kitchen. Please collect it now.",
      }),
    );
  });

  it("swallows constructor errors", async () => {
    installNotification("granted", { throwOnNew: true });
    await expect(
      fireReadyNotification("Booth", "0001"),
    ).resolves.toBeUndefined();
  });

  it("is a no-op when unsupported", async () => {
    vi.stubGlobal("window", {});
    await expect(
      fireReadyNotification("Booth", "0001"),
    ).resolves.toBeUndefined();
  });
});

describe("fireNewOrderNotification", () => {
  it("does nothing when permission is not granted", async () => {
    const ctor = installNotification("default");
    await fireNewOrderNotification("Booth", "0001");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("constructs a distinct-tag notification when granted", async () => {
    const ctor = installNotification("granted");
    await fireNewOrderNotification("Mama's Kitchen", "0042");
    expect(ctor).toHaveBeenCalledWith(
      "New order #0042",
      expect.objectContaining({
        tag: "qkit-new-order-0042",
        body: "Mama's Kitchen. Tap to view.",
      }),
    );
  });
});

describe("playReadyChime + unlockAudio", () => {
  it("returns false when no AudioContext exists", async () => {
    vi.stubGlobal("window", {});
    expect(await playReadyChime()).toBe(false);
  });

  it("schedules the chime notes and returns true", async () => {
    const { ctx } = mockAudio("running");
    expect(await playReadyChime()).toBe(true);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(6);
  });

  it("reuses one shared context across calls (singleton)", async () => {
    const { ctx, Ctor } = mockAudio("running");
    await playReadyChime();
    await playReadyChime();
    expect(Ctor).toHaveBeenCalledTimes(1); // not a fresh context per chime
    expect(ctx.createOscillator).toHaveBeenCalledTimes(12);
  });

  it("resumes a suspended context before scheduling", async () => {
    const { ctx } = mockAudio("suspended");
    await playReadyChime();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("unlockAudio resumes a suspended context", () => {
    const { ctx } = mockAudio("suspended");
    unlockAudio();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("unlockAudio contains a synchronous browser resume failure", () => {
    const { ctx } = mockAudio("suspended");
    ctx.resume.mockImplementation(() => {
      throw new Error("audio blocked");
    });
    expect(() => unlockAudio()).not.toThrow();
    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it("unlockAudio handles a rejected resume promise", async () => {
    const { ctx } = mockAudio("suspended");
    const failure = Promise.reject(new Error("context closed"));
    const catchSpy = vi.spyOn(failure, "catch");
    ctx.resume.mockReturnValue(failure);
    unlockAudio();
    expect(catchSpy).toHaveBeenCalledOnce();
    await expect(catchSpy.mock.results[0].value).resolves.toBeUndefined();
  });

  it("unlockAudio leaves a running context alone", () => {
    const { ctx } = mockAudio("running");
    unlockAudio();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("returns false if the AudioContext throws", async () => {
    const Ctor = vi.fn(() => {
      throw new Error("audio blocked");
    });
    vi.stubGlobal("window", { AudioContext: Ctor });
    expect(await playReadyChime()).toBe(false);
  });
});

describe("playSound", () => {
  it.each([
    ["chime", 6, "the same 6-note sequence as playReadyChime"],
    ["bell", 2, "two notes (toot toot)"],
    ["ding", 1, "a single note"],
    ["horn", 2, "two notes"],
    ["triple", 3, "three notes"],
  ] as const)("%s schedules %i: %s", async (sound, notes, _what) => {
    const { ctx } = mockAudio("running");
    expect(await playSound(sound)).toBe(true);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(notes);
  });

  it("none is a silent no-op (no AudioContext touched)", async () => {
    const { Ctor } = mockAudio("running");
    expect(await playSound("none")).toBe(true);
    expect(Ctor).not.toHaveBeenCalled();
  });

  it("cuts off notes still ringing from a rapid re-trigger", async () => {
    const { ctx } = mockAudio("running");
    await playSound("chime");
    const firstOsc = ctx.createOscillator.mock.results[0].value;
    await playSound("bell");
    expect(firstOsc.stop).toHaveBeenCalled();
  });
});
