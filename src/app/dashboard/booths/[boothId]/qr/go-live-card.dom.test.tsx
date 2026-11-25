// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { GoLiveCard } from "./go-live-card";

const props = {
  boothId: "b-1",
  code: "abc123",
  menuReady: true,
  payment: "ready" as const,
  paymentUrl: "https://paykit.example/dashboard/config",
};

describe("GoLiveCard", () => {
  it("ticks both steps when the menu and payment are ready", () => {
    render(<GoLiveCard {...props} />);
    expect(screen.getAllByLabelText("Done")).toHaveLength(2);
    expect(screen.queryByLabelText("Not done")).toBeNull();
    expect(screen.getByRole("link", { name: "Edit menu" })).toHaveAttribute(
      "href",
      "/dashboard/booths/b-1/menu",
    );
    expect(
      screen.getByRole("link", { name: "Change payment" }),
    ).toHaveAttribute("href", props.paymentUrl);
  });

  it("leaves the steps unticked when nothing is set up", () => {
    render(<GoLiveCard {...props} menuReady={false} payment="missing" />);
    expect(screen.getAllByLabelText("Not done")).toHaveLength(2);
    expect(screen.queryByLabelText("Done")).toBeNull();
    expect(screen.getByRole("link", { name: "Add items" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up payment" }),
    ).toBeInTheDocument();
  });

  it("shows no tick for payment when paykit did not answer", () => {
    render(<GoLiveCard {...props} payment="unknown" />);
    expect(screen.getAllByLabelText("Done")).toHaveLength(1);
    expect(screen.queryByLabelText("Not done")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Set up payment" }),
    ).toBeInTheDocument();
  });

  it("opens the customer page in a new tab and links to the board", () => {
    render(<GoLiveCard {...props} />);
    const order = screen.getByRole("link", { name: "Open my booth page" });
    expect(order).toHaveAttribute("href", "/o/abc123");
    expect(order).toHaveAttribute("target", "_blank");
    expect(
      screen.getByText(/Order from your phone, then watch it land/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to board" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
