// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardNav } from "./dashboard-nav";
import type { ActionResult } from "@/lib/action-result";

const mocks = vi.hoisted(() => {
  const state = { pathname: "/dashboard" };
  return {
    state,
    submitFeedback: vi.fn<() => Promise<ActionResult>>(async () => ({
      success: true,
    })),
    submitSupportMessage: vi.fn<() => Promise<ActionResult>>(async () => ({
      success: true,
    })),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.state.pathname,
}));
vi.mock("@/app/actions/feedback", () => ({
  submitFeedback: mocks.submitFeedback,
}));
vi.mock("@/app/actions/support", () => ({
  submitSupportMessage: mocks.submitSupportMessage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.pathname = "/dashboard";
  mocks.submitFeedback.mockResolvedValue({ success: true });
  mocks.submitSupportMessage.mockResolvedValue({ success: true });
});

describe("DashboardNav", () => {
  const baseProps = {
    signOut: vi.fn(async () => {}),
    vendorName: "Kopi Corner",
    avatarUrl: null,
    tier: "free" as const,
  };

  it("renders Orders, Completed, Booths, and Stats as inline nav links, with no Plan link", () => {
    render(<DashboardNav {...baseProps} />);
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Completed" })).toHaveAttribute(
      "href",
      "/dashboard/completed",
    );
    expect(screen.getByRole("link", { name: "Booths" })).toHaveAttribute(
      "href",
      "/dashboard/booths",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats",
    );
    expect(
      screen.queryByRole("link", { name: "Plan" }),
    ).not.toBeInTheDocument();
  });

  it("account menu has Switch products, Profile, Settings, Plan, Get help, Feedback, User guide, Theme (in that order), then Sign out", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    const accountButton = screen.getByRole("button", {
      name: /account menu/i,
    });
    await user.click(accountButton);

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Switch products",
      "Profile",
      "Settings",
      "Plan · free",
      "Get help",
      "Feedback",
      "User guide",
      "Theme · System",
      "Sign out",
    ]);
    expect(
      screen.getByRole("menuitem", { name: "User guide" }),
    ).toHaveAttribute("href", "/dashboard/help");
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "href",
      "/dashboard/settings",
    );
    expect(screen.getByRole("menuitem", { name: /^Plan/ })).toHaveAttribute(
      "href",
      "/dashboard/plan",
    );
  });

  it("shows the vendor's real stall name as the account subtitle, not a generic label", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);

    expect(screen.getAllByText("Kopi Corner").length).toBeGreaterThan(0);
    expect(screen.queryByText("Vendor account")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getAllByText("Kopi Corner").length).toBeGreaterThan(1);
  });

  it("falls back to a generic subtitle when the vendor has no name set", () => {
    render(<DashboardNav {...baseProps} vendorName="" />);
    expect(screen.getAllByText("Your stall").length).toBeGreaterThan(0);
  });

  it("stamps data-tour=nav-account on the account trigger", () => {
    render(<DashboardNav {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /account menu/i }),
    ).toHaveAttribute("data-tour", "nav-account");
  });

  it("renders the tier badge for the current plan tier", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} tier="qkit" />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("marks the active nav link via aria-current", () => {
    mocks.state.pathname = "/dashboard/booths";
    render(<DashboardNav {...baseProps} />);
    expect(screen.getByRole("link", { name: "Booths" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Orders" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("opening Feedback from the account menu and submitting calls submitFeedback with vendor source and the picked NPS score", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: "Feedback" }));

    await user.click(screen.getByRole("radio", { name: "9" }));
    await user.type(screen.getByLabelText("Message"), "Love the board");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.submitFeedback).toHaveBeenCalledWith({
      source: "vendor",
      nps: 9,
      message: "Love the board",
    });
  });

  it("a failed feedback submit surfaces an inline error, not a silent failure", async () => {
    mocks.submitFeedback.mockResolvedValue({
      success: false,
      error: "Thanks, you've already sent feedback.",
    });
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: "Feedback" }));

    await user.click(screen.getByRole("radio", { name: "5" }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Thanks, you've already sent feedback."),
    ).toBeInTheDocument();
  });

  it("passes the three sibling live kits to the account menu's Switch products submenu", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(await screen.findByText(/switch products/i));

    const loopkit = await screen.findByRole("menuitem", { name: "loopkit" });
    expect(loopkit).toHaveAttribute("href", "https://loopkit.merqo.io");
    const paykit = await screen.findByRole("menuitem", { name: "paykit" });
    expect(paykit).toHaveAttribute("href", "https://paykit.merqo.io");
    const stockkit = await screen.findByRole("menuitem", { name: "stockkit" });
    expect(stockkit).toHaveAttribute("href", "https://stockkit.merqo.io");
  });

  it("opening Get help and submitting maps the sheet's message to submitSupportMessage's body field", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: "Get help" }));

    await user.click(screen.getByRole("radio", { name: "Payment" }));
    await user.type(
      screen.getByLabelText("Message"),
      "My pass didn't activate",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.submitSupportMessage).toHaveBeenCalledWith({
      category: "payment",
      body: "My pass didn't activate",
    });
  });
});
