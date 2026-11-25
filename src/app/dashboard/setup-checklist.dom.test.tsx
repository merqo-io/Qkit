// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SetupChecklist } from "./setup-checklist";
import { resetSetupMemory } from "@/lib/setup-checklist-storage";
import type { ChecklistBooth } from "@/lib/setup-checklist";

const booth = (over: Partial<ChecklistBooth> = {}): ChecklistBooth => ({
  id: "b1",
  menuItemCount: 0,
  hasPayment: false,
  open: true,
  ...over,
});

beforeEach(() => {
  window.localStorage.clear();
  resetSetupMemory();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SetupChecklist", () => {
  it("renders nothing with no booth, leaving the empty state to the board", () => {
    const { container } = render(
      <SetupChecklist booth={null} hasOrders={false} />,
    );
    expect(container.textContent).toBe("");
  });

  it("shows progress and the single next step for a partly set up booth", () => {
    render(<SetupChecklist booth={booth()} hasOrders={false} />);
    expect(screen.getByText("Setup: 1 of 5 done")).toBeTruthy();
    const next = screen.getByRole("link", { name: "Add menu items" });
    expect(next.getAttribute("href")).toBe("/dashboard/booths/b1/menu");
    expect(screen.queryByText("Place a test order")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /All steps/ }));
    expect(screen.getByText("Place a test order")).toBeTruthy();
  });

  it("links the payment step to the Payment card and lets the vendor skip it", () => {
    render(
      <SetupChecklist booth={booth({ menuItemCount: 2 })} hasOrders={false} />,
    );
    expect(
      screen
        .getByRole("link", { name: "Connect payment" })
        .getAttribute("href"),
    ).toBe("/dashboard/booths/b1#payment");
    fireEvent.click(
      screen.getByRole("button", { name: "Skip, take payment at the counter" }),
    );
    expect(window.localStorage.getItem("qkit:setup:payment-skipped:b1")).toBe(
      "1",
    );
    expect(screen.getByText("Setup: 3 of 5 done")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go live" })).toBeTruthy();
  });

  it("offers the payment skip once, not again in the expanded list", () => {
    render(
      <SetupChecklist booth={booth({ menuItemCount: 2 })} hasOrders={false} />,
    );
    const skip = { name: "Skip, take payment at the counter" };
    expect(screen.getAllByRole("button", skip)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /All steps/ }));
    expect(screen.getAllByRole("button", skip)).toHaveLength(1);
  });

  it("reads a skipped payment saved earlier", () => {
    window.localStorage.setItem("qkit:setup:payment-skipped:b1", "1");
    render(
      <SetupChecklist booth={booth({ menuItemCount: 2 })} hasOrders={false} />,
    );
    expect(screen.getByText("Setup: 3 of 5 done")).toBeTruthy();
  });

  it("renders nothing for an existing vendor with orders", () => {
    const { container } = render(
      <SetupChecklist
        booth={booth({ menuItemCount: 4, hasPayment: true })}
        hasOrders
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("hides on request and stays hidden next time", () => {
    const first = render(<SetupChecklist booth={booth()} hasOrders={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(first.container.textContent).toBe("");
    first.unmount();
    const second = render(<SetupChecklist booth={booth()} hasOrders={false} />);
    expect(second.container.textContent).toBe("");
  });

  it("still renders when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <SetupChecklist booth={booth({ menuItemCount: 1 })} hasOrders={false} />,
    );
    expect(screen.getByText("Setup: 2 of 5 done")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText(/Setup:/)).toBeNull();
  });
});
