// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { GoLiveCard, PaymentRow, type PaymentStep } from "./go-live-card";

const props = {
  boothId: "b-1",
  code: "abc123",
  menuReady: true,
  paymentUrl:
    "https://paykit.example/dashboard/config?return_to=http%3A%2F%2Flocalhost%3A3000%2Fdashboard%2Fbooths%2Fb-1%2Fqr",
};

function card(payment: PaymentStep, menuReady = true) {
  return (
    <GoLiveCard
      boothId={props.boothId}
      code={props.code}
      menuReady={menuReady}
      paymentRow={
        <PaymentRow payment={payment} paymentUrl={props.paymentUrl} />
      }
    />
  );
}

describe("GoLiveCard", () => {
  it("ticks both steps when the menu and payment are ready", () => {
    render(card("ready"));
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
    render(card("missing", false));
    expect(screen.getAllByLabelText("Not done")).toHaveLength(2);
    expect(screen.queryByLabelText("Done")).toBeNull();
    expect(screen.getByRole("link", { name: "Add items" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up payment" }),
    ).toBeInTheDocument();
  });

  it("shows no tick for payment when paykit did not answer", () => {
    render(card("unknown"));
    expect(screen.getAllByLabelText("Done")).toHaveLength(1);
    expect(screen.queryByLabelText("Not done")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Check payment in paykit" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Set up payment" })).toBeNull();
  });

  it("opens the payment link in the same tab with the way back encoded", () => {
    render(card("missing"));
    const link = screen.getByRole("link", { name: "Set up payment" });
    expect(link).toHaveAttribute("href", props.paymentUrl);
    expect(link.getAttribute("href")).toContain(
      "return_to=http%3A%2F%2Flocalhost%3A3000%2Fdashboard%2Fbooths%2Fb-1%2Fqr",
    );
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("rel");
  });

  it("shows a placeholder, not a link, while paykit is being asked", () => {
    render(card("checking"));
    expect(screen.getByText("Checking payment...")).toBeInTheDocument();
    expect(screen.queryByLabelText("Not done")).toBeNull();
    expect(screen.queryByRole("link", { name: /payment/i })).toBeNull();
  });

  it("opens the customer page in a new tab and links to the board", () => {
    render(card("ready"));
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
