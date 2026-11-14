// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("OrderWatch", () => {
  it("shows the complete placed order under reduced motion", () => {
    mockMatchMedia(true);
    render(<OrderWatch />);
    expect(screen.getByText("ORDER PLACED")).toBeVisible();
    expect(screen.getByText("Place order")).toBeVisible();
    expect(screen.getByText("Iced")).toBeVisible();
  });
});
