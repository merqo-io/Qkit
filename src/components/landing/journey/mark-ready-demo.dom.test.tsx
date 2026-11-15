// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkReadyDemo } from "./mark-ready-demo";
import { OrderWatch } from "./order-watch";

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduced,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("MarkReadyDemo", () => {
  it("starts on the ticket with the payment line and Mark Ready", () => {
    mockMatchMedia(false);
    render(<MarkReadyDemo />);
    expect(screen.getByText("Says paid. Check the payment")).toBeVisible();
    expect(screen.getByRole("button", { name: "Mark Ready" })).toBeVisible();
    expect(screen.getByText("Preparing your order")).toBeVisible();
  });

  it("reserves the height of the longest caption so the ticket cannot shift", () => {
    mockMatchMedia(false);
    const { container } = render(<MarkReadyDemo />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent("Tap Mark Ready on the ticket.");
    expect(live).toHaveClass("col-start-1", "row-start-1");
    const sizers = Array.from(
      live?.parentElement?.querySelectorAll('p[aria-hidden="true"]') ?? [],
    );
    expect(sizers).toHaveLength(3);
    sizers.forEach((p) => {
      expect(p).toHaveClass("invisible", "col-start-1", "row-start-1");
    });
    expect(live?.parentElement).toHaveClass("grid");
  });

  it("stamps the ticket and updates the phone when pressed by touch", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<MarkReadyDemo />);
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("button", { name: "Mark Ready" }),
    });
    expect(screen.getByText("READY")).toBeVisible();
    expect(screen.getByText("Ready. Collect at the counter.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Mark Picked Up" }),
    ).toBeVisible();
  });

  it("works from the keyboard through to play again", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<MarkReadyDemo />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Mark Ready" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard("[Space]");
    expect(screen.getByText("All caught up.")).toBeVisible();
    expect(screen.getByText("0 active")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.getByRole("button", { name: "Mark Ready" })).toBeVisible();
    expect(screen.getByText("1 active")).toBeVisible();
  });

  it("keeps keyboard focus through every transition", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<MarkReadyDemo />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("button", { name: "Mark Picked Up" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Play again" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Mark Ready" })).toHaveFocus();
  });

  it("stays operable under reduced motion", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<MarkReadyDemo />);
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("button", { name: "Mark Ready" }),
    });
    expect(screen.getByText("READY")).toBeVisible();
  });
});

describe("MarkReadyDemo motion", () => {
  const animate = vi.fn();
  let observed: (() => void) | undefined;

  beforeEach(() => {
    animate.mockClear();
    observed = undefined;
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          observed = () =>
            cb(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "animate");
  });

  it("animates the stamp once and never under reduced motion", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    const { unmount } = render(<MarkReadyDemo />);
    observed?.();
    await user.keyboard("{Tab}{Enter}");
    expect(screen.getByText("READY")).toBeVisible();
    expect(animate).not.toHaveBeenCalled();
    unmount();

    mockMatchMedia(false);
    render(<MarkReadyDemo />);
    await user.keyboard("{Tab}{Enter}");
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("prints the ticket when it first scrolls into view, and again after play again", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<MarkReadyDemo />);
    expect(animate).not.toHaveBeenCalled();
    observed?.();
    expect(animate).toHaveBeenCalledTimes(1);
    await user.keyboard("{Tab}{Enter}{Enter}{Enter}");
    // stamp once, then the reprint after the ticket remounts
    observed?.();
    expect(animate).toHaveBeenCalledTimes(3);
  });
});

describe("OrderWatch", () => {
  it("shows the complete placed order under reduced motion", () => {
    mockMatchMedia(true);
    render(<OrderWatch />);
    expect(screen.getByText("ORDER PLACED")).toBeVisible();
    expect(screen.getByText("Place order")).toBeVisible();
    expect(screen.getByText("Iced")).toBeVisible();
  });
});
