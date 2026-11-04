// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtimeOrders } from "./use-realtime-orders";

type StatusCb = (status: string) => void;

interface FakeChannel {
  topic: string;
  statusCb?: StatusCb;
  on: () => FakeChannel;
  subscribe: (cb: StatusCb) => FakeChannel;
}

const registry = new Map<string, FakeChannel>();
const removed: string[] = [];

// Mirrors realtime-js: channel() returns the still-registered channel for a
// topic, and removeChannel is async, firing CLOSED on the subscribe callback.
const fakeClient = {
  from: () => {
    const builder = {
      select: () => builder,
      in: () => builder,
      not: () => builder,
      order: () => builder,
      gt: () => builder,
      limit: () => Promise.resolve({ data: [], error: null }),
    };
    return builder;
  },
  channel: (topic: string) => {
    const existing = registry.get(topic);
    if (existing) return existing;
    const channel: FakeChannel = {
      topic,
      on: () => channel,
      subscribe: (cb) => {
        channel.statusCb = cb;
        return channel;
      },
    };
    registry.set(topic, channel);
    return channel;
  },
  removeChannel: async (channel: FakeChannel) => {
    removed.push(channel.topic);
    await Promise.resolve();
    registry.delete(channel.topic);
    channel.statusCb?.("CLOSED");
  },
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => fakeClient,
}));

async function emitToLive(status: string) {
  await act(async () => {
    for (const channel of registry.values()) channel.statusCb?.(status);
  });
}

beforeEach(() => {
  registry.clear();
  removed.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("useRealtimeOrders under StrictMode", () => {
  it("ends connected after the double mount tears the first channel down", async () => {
    const { result } = renderHook(() => useRealtimeOrders(["b1"], []), {
      wrapper: StrictMode,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(removed).toHaveLength(1);
    expect(registry.size).toBe(1);

    await emitToLive("SUBSCRIBED");
    expect(result.current.status).toBe("connected");
  });

  it.each(["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"])(
    "reports disconnected when the live channel emits %s",
    async (status) => {
      const { result } = renderHook(() => useRealtimeOrders(["b1"], []), {
        wrapper: StrictMode,
      });
      await act(async () => {
        await Promise.resolve();
      });
      await emitToLive("SUBSCRIBED");
      expect(result.current.status).toBe("connected");

      await emitToLive(status);
      expect(result.current.status).toBe("disconnected");
    },
  );
});
