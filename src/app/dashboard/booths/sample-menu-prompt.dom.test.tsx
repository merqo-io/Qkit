// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { seedSampleMenu, toastError } = vi.hoisted(() => ({
  seedSampleMenu: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("./seed-sample-menu", () => ({ seedSampleMenu }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

import { SampleMenuPrompt } from "./sample-menu-prompt";

beforeEach(() => {
  seedSampleMenu.mockReset();
  toastError.mockReset();
});

describe("SampleMenuPrompt", () => {
  it("shows the button and its helper copy", () => {
    render(<SampleMenuPrompt boothId="b-1" onAdded={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Start with a sample menu" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Three drinks to start. Change names and prices, or delete them.",
      ),
    ).toBeInTheDocument();
  });

  it("hands the saved items to the parent after one tap", async () => {
    const items = [
      { id: "i1", name: "Kopi", description: "", available: true },
    ];
    seedSampleMenu.mockResolvedValue({ success: true, items });
    const onAdded = vi.fn();
    render(<SampleMenuPrompt boothId="b-1" onAdded={onAdded} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Start with a sample menu" }),
    );

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(items));
    expect(seedSampleMenu).toHaveBeenCalledWith("b-1");
  });

  it("toasts the server's refusal and adds nothing", async () => {
    seedSampleMenu.mockResolvedValue({
      success: false,
      error: "This booth already has menu items",
    });
    const onAdded = vi.fn();
    render(<SampleMenuPrompt boothId="b-1" onAdded={onAdded} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Start with a sample menu" }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "This booth already has menu items",
      ),
    );
    expect(onAdded).not.toHaveBeenCalled();
  });
});
