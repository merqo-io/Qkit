// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TryIt } from "./try-it";

function mockMatchMedia(opts: { reduced: boolean; wide?: boolean }) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (q: string) => ({
    get matches() {
      return q.includes("reduced-motion") ? opts.reduced : !!opts.wide;
    },
    media: q,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    dispatchEvent: () => false,
  }));
  return (reduced: boolean) => {
    opts.reduced = reduced;
    act(() => listeners.forEach((fn) => fn()));
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("TryIt on a phone", () => {
  it("shows one device at a time and cues the hidden board", async () => {
    mockMatchMedia({ reduced: false });
    const user = userEvent.setup();
    const { container } = render(<TryIt />);

    const phoneTab = screen.getByRole("tab", { name: /Customer's phone/ });
    const boardTab = screen.getByRole("tab", { name: /Your board/ });
    expect(phoneTab).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector("#story-board")).toHaveAttribute("data-off");

    await user.click(screen.getByRole("button", { name: /Place order/ }));
    expect(phoneTab).toHaveAttribute("aria-selected", "true");
    expect(boardTab).toHaveTextContent("Tap to continue");

    await user.click(boardTab);
    expect(boardTab).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector("#story-phone")).toHaveAttribute("data-off");
    expect(container.querySelector("#story-board")).not.toHaveAttribute(
      "data-off",
    );
  });

  it("has a single live region and the stepper labels", () => {
    mockMatchMedia({ reduced: false });
    const { container } = render(<TryIt />);
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "1 Order" })).toBeVisible();
    expect(screen.getByRole("button", { name: "3 Ready" })).toBeVisible();
  });
});

describe("TryIt with reduced motion", () => {
  it("shows the finished state", () => {
    mockMatchMedia({ reduced: true, wide: true });
    render(<TryIt />);
    expect(screen.getAllByText("Collected").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Play it again" })).toBeVisible();
  });

  it("settles when the setting turns on while mounted", () => {
    const setReduced = mockMatchMedia({ reduced: false });
    render(<TryIt />);
    expect(screen.queryAllByText("Collected")).toHaveLength(0);
    setReduced(true);
    expect(screen.getAllByText("Collected").length).toBeGreaterThan(0);
  });

  it("highlights the step passing the viewport middle on a wide page", async () => {
    mockMatchMedia({ reduced: true, wide: true });
    const rect = vi
      .spyOn(HTMLLIElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLLIElement) {
        const i = Array.from(this.parentElement?.children ?? []).indexOf(this);
        return { top: i < 2 ? -50 : 5000 } as DOMRect;
      });
    const { container } = render(<TryIt />);
    fireEvent.scroll(window);
    await waitFor(() => {
      const items = container.querySelectorAll("#story > ol > li");
      expect(Array.from(items).map((li) => li.hasAttribute("data-on"))).toEqual(
        [false, true, false],
      );
    });
    expect(screen.getAllByText("Collected").length).toBeGreaterThan(0);
    rect.mockRestore();
  });
});
