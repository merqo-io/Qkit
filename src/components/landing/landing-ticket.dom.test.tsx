// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingTicket, type LandingTicketData } from "./landing-ticket";

const priced: LandingTicketData = {
  n: "0042",
  name: "Ada",
  status: "preparing",
  payment: "unpaid",
  age: { label: "4m", tone: "aging" },
  lines: [{ q: 2, name: "Kopi", opt: "Iced" }],
  action: "Mark Ready",
};
const queueOnly: LandingTicketData = {
  n: "0009",
  name: "Wei",
  status: "ready",
  lines: [{ q: 1, name: "Single Scoop", opt: "Vanilla" }],
};

describe("LandingTicket", () => {
  it("renders number, name, line, option, age and action", () => {
    const { container } = render(<LandingTicket t={priced} />);
    expect(screen.getByText("#0042")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.getByText("Iced")).toBeInTheDocument();
    expect(screen.getByText("Mark Ready")).toBeInTheDocument();
    expect(screen.getByText("4m")).toBeInTheDocument();
    expect(container.querySelector(".ticket-aging")).not.toBeNull();
  });

  it("says an unpaid order is not paid yet, in one line, with no amount", () => {
    render(<LandingTicket t={priced} />);
    expect(screen.getByText("Not paid yet")).toBeInTheDocument();
    expect(screen.queryByText("$7.20")).toBeNull();
    expect(screen.queryByText(/Total/i)).toBeNull();
  });

  it("states neither Preparing nor Paid: the states with nothing to do", () => {
    render(<LandingTicket t={{ ...priced, payment: "paid" }} />);
    expect(screen.queryByText("Preparing")).toBeNull();
    expect(screen.queryByText("Paid")).toBeNull();
    expect(screen.queryByText("Not paid yet")).toBeNull();
  });

  it("badges a status past preparing", () => {
    render(<LandingTicket t={queueOnly} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders queue-only: no attention line, no wash", () => {
    const { container } = render(<LandingTicket t={queueOnly} />);
    expect(screen.getByText("Single Scoop")).toBeInTheDocument();
    expect(screen.queryByText("Not paid yet")).toBeNull();
    expect(screen.queryByText(/Says paid/)).toBeNull();
    expect(
      container.querySelector(".ticket-aging,.ticket-overdue,.ticket-alert"),
    ).toBeNull();
  });

  it("a claimed payment gets the alert wash, and the check line, with no amount", () => {
    const { container } = render(
      <LandingTicket
        t={{
          ...priced,
          payment: "claimed",
          age: undefined,
          action: "Confirm payment received",
        }}
      />,
    );
    expect(
      screen.getByText("Says paid. Check the payment"),
    ).toBeInTheDocument();
    expect(container.querySelector(".ticket-alert")).not.toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("shows every option on one line, with nothing to expand", () => {
    render(
      <LandingTicket
        t={{
          n: "0018",
          name: "Mei",
          status: "preparing",
          lines: [
            {
              q: 1,
              name: "Single Scoop",
              options: [
                { group: "Flavour", choice: "Vanilla" },
                { group: "Toppings", choice: "Sprinkles" },
              ],
            },
          ],
          action: "Mark Ready",
        }}
      />,
    );
    expect(screen.getByText("Vanilla · Sprinkles")).toBeInTheDocument();
    expect(screen.queryByText("Show options")).toBeNull();
    expect(screen.queryByText("Hide options")).toBeNull();
  });
});
