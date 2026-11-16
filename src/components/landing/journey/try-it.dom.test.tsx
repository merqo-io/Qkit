// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TryIt } from "./try-it";

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

function lane(queue: HTMLElement, heading: string) {
  return within(queue).getByText(heading).nextElementSibling;
}

describe("TryIt untouched", () => {
  it("puts the sample ticket on the board with Mark Ready and the number under Preparing", () => {
    mockMatchMedia(false);
    render(<TryIt />);
    expect(screen.getByText("Ada")).toBeVisible();
    expect(screen.getByText("Says paid. Check the payment")).toBeVisible();
    expect(screen.getByRole("button", { name: "Mark Ready" })).toBeVisible();
    const queue = screen.getByRole("group", { name: "Queue screen" });
    expect(lane(queue, "Preparing")).toHaveTextContent("#0042");
    expect(lane(queue, "Ready for pickup")).toBeEmptyDOMElement();
  });

  it("shows the placed sample order on the server-rendered phone", () => {
    mockMatchMedia(false);
    render(<TryIt />);
    expect(screen.getByText("ORDER PLACED")).toBeVisible();
    expect(screen.getAllByText("Preparing your order")).toHaveLength(2);
  });

  it("pins chapter 1 in a tall track, and drops the track under reduced motion", () => {
    mockMatchMedia(false);
    const pinned = render(<TryIt />);
    expect(pinned.container.querySelector("[data-pinned]")).toHaveClass(
      "sticky",
    );
    expect(pinned.container.querySelector("[data-pin-track]")).not.toBeNull();
    pinned.unmount();

    mockMatchMedia(true);
    const calm = render(<TryIt />);
    expect(calm.container.querySelector("[data-pinned]")).toBeNull();
    expect(calm.container.querySelector("[data-pin-track]")).toBeNull();
    expect(calm.container.querySelector(".sticky")).toBeNull();
    expect(screen.getByText("Tap + to add a kopi")).toBeVisible();
  });

  it("hands the phone to the visitor on the first tap", () => {
    mockMatchMedia(false);
    render(<TryIt />);
    fireEvent.click(screen.getByLabelText("Add one kopi"));
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByText("No orders yet.")).toBeVisible();
    expect(screen.getByText("0 active")).toBeVisible();
    expect(screen.getByText("1 item")).toBeVisible();
  });

  it("has exactly one live region", () => {
    mockMatchMedia(false);
    const { container } = render(<TryIt />);
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
  });
});

describe("TryIt full flow", () => {
  it("plays one order from customer to stall to queue and back", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    const { container } = render(<TryIt />);
    const queue = screen.getByRole("group", { name: "Queue screen" });
    const live = container.querySelector("[aria-live]");

    expect(screen.getByText("Tap + to add a kopi")).toBeVisible();
    const add = screen.getByRole("button", { name: "Add one kopi" });
    await user.click(add);
    await user.click(add);
    await user.click(add);
    await user.click(screen.getByRole("button", { name: "Remove one kopi" }));
    expect(screen.getByText("2 items")).toBeVisible();
    expect(screen.getByText("No orders yet.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Place order/ }));
    expect(screen.getByText("ORDER PLACED")).toBeVisible();
    expect(screen.getByText("You")).toBeVisible();
    expect(screen.getByText("2×")).toBeVisible();
    expect(lane(queue, "Preparing")).toHaveTextContent("#0042");
    expect(live).toHaveTextContent("Order placed, number 0042. Preparing.");
    expect(screen.getAllByText("Preparing your order")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    expect(screen.getByText("READY")).toBeVisible();
    expect(lane(queue, "Preparing")).toBeEmptyDOMElement();
    expect(lane(queue, "Ready for pickup")).toHaveTextContent("#0042");
    expect(screen.getAllByText("Ready. Collect at the counter.")).toHaveLength(
      2,
    );
    expect(live).toHaveTextContent("Order 0042 is ready.");

    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));
    expect(screen.getByText("All caught up.")).toBeVisible();
    expect(screen.getByText("0 active")).toBeVisible();
    expect(lane(queue, "Ready for pickup")).toBeEmptyDOMElement();
    expect(screen.getAllByText("Picked up. Enjoy your kopi.")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.getByText("Ada")).toBeVisible();
    expect(screen.getByText("Tap + to add a kopi")).toBeVisible();
    expect(screen.queryByText("ORDER PLACED")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Ready" })).toBeVisible();
    expect(live).toBeEmptyDOMElement();
  });

  it("caps the quantity and keeps the order frozen once placed", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<TryIt />);
    const add = screen.getByRole("button", { name: "Add one kopi" });
    for (let i = 0; i < 9; i++) await user.click(add);
    expect(screen.getByText("6 items")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Place order/ }));
    expect(screen.getByText("6×")).toBeVisible();
  });

  it("completes by keyboard and hands focus to the control that replaces the pressed one", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<TryIt />);
    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    expect(
      screen.getByRole("button", { name: "Mark Picked Up" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Play again" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Mark Ready" })).toHaveFocus();
  });

  it("keeps one reachable board action per stage", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    const { container } = render(<TryIt />);
    const board = () =>
      screen
        .getAllByRole("button")
        .map((b) => b.textContent)
        .filter((t) => /Mark|Play/.test(t ?? ""));
    expect(board()).toEqual(["Mark Ready"]);
    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    expect(board()).toEqual(["Mark Picked Up"]);
    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));
    expect(board()).toEqual(["Play again"]);
    const reserve = container.querySelector(".invisible[inert]");
    expect(reserve).toHaveClass("invisible", "col-start-1", "row-start-1");
  });

  it("works by touch", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<TryIt />);
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("button", { name: "Mark Ready" }),
    });
    expect(screen.getByText("READY")).toBeVisible();
  });

  it("reserves the longest caption so nothing below moves", () => {
    mockMatchMedia(true);
    const { container } = render(<TryIt />);
    const captions = container.querySelectorAll(".grid.max-w-\\[34ch\\]");
    expect(captions).toHaveLength(2);
    captions.forEach((c) => {
      const sizers = c.querySelectorAll('p[aria-hidden="true"]');
      expect(sizers).toHaveLength(4);
      sizers.forEach((p) =>
        expect(p).toHaveClass("invisible", "col-start-1", "row-start-1"),
      );
    });
  });
});

describe("TryIt motion", () => {
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
    const calm = render(<TryIt />);
    observed?.();
    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    expect(screen.getByText("READY")).toBeVisible();
    expect(animate).not.toHaveBeenCalled();
    calm.unmount();

    mockMatchMedia(false);
    render(<TryIt />);
    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("prints the ticket once it is half in view, and again after play again", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<TryIt />);
    expect(animate).not.toHaveBeenCalled();
    observed?.();
    expect(animate).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Mark Ready" }));
    await user.click(screen.getByRole("button", { name: "Mark Picked Up" }));
    await user.click(screen.getByRole("button", { name: "Play again" }));
    observed?.();
    expect(animate).toHaveBeenCalledTimes(3);
  });
});
