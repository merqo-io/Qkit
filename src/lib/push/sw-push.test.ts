import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Listener = (event: unknown) => void;

function loadServiceWorker() {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async () => undefined);
  const self = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    registration: { showNotification },
    location: { origin: "https://qkit.example" },
    clients: {},
    skipWaiting: () => undefined,
  };
  const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  // eslint-disable-next-line sonarjs/code-eval -- runs the repo's own public/sw.js in a sandbox
  runInNewContext(source, { self, URL });
  return { push: listeners.get("push"), showNotification };
}

function pushEvent(data: unknown) {
  const waitUntil = vi.fn();
  return {
    event: {
      data: data === undefined ? null : { json: () => data },
      waitUntil,
    },
    waitUntil,
  };
}

describe("sw.js push handler", () => {
  it("shows the ready notification from the push payload", () => {
    const { push, showNotification } = loadServiceWorker();
    const { event, waitUntil } = pushEvent({
      title: "Order #7 is ready",
      body: "Kopi Cart. Please collect it now.",
      url: "/order/b/7?t=tok",
      tag: "qkit-order-7",
    });
    push?.(event);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith("Order #7 is ready", {
      body: "Kopi Cart. Please collect it now.",
      tag: "qkit-order-7",
      data: { url: "/order/b/7?t=tok" },
    });
  });

  it("ignores an empty or malformed payload", () => {
    const { push, showNotification } = loadServiceWorker();
    push?.(pushEvent(undefined).event);
    push?.(pushEvent({ title: 1 }).event);
    const broken = {
      data: {
        json: () => {
          throw new Error("not json");
        },
      },
      waitUntil: vi.fn(),
    };
    push?.(broken);
    expect(showNotification).not.toHaveBeenCalled();
  });
});
