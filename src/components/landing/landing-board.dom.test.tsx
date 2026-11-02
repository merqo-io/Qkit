// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingBoard } from "./landing-board";
import { LANDING_BOARDS } from "./landing-boards";

describe("LANDING_BOARDS", () => {
  it("has the 4 expected boards", () => {
    expect(LANDING_BOARDS.map((b) => b.key)).toEqual([
      "coffee",
      "icecream",
      "payment",
      "rush",
    ]);
  });
  it("icecream board is queue-only (no ticket has a payment)", () => {
    const ice = LANDING_BOARDS.find((b) => b.key === "icecream")!;
    for (const t of ice.tickets) {
      expect(t.payment).toBeUndefined();
    }
  });
  it("payment board shows a claimed and a paid ticket", () => {
    const pay = LANDING_BOARDS.find((b) => b.key === "payment")!;
    const payments = pay.tickets.map((t) => t.payment);
    expect(payments).toContain("claimed");
    expect(payments).toContain("paid");
  });
  it("rush board has an overdue ticket", () => {
    const rush = LANDING_BOARDS.find((b) => b.key === "rush")!;
    expect(rush.tickets.some((t) => t.age?.tone === "overdue")).toBe(true);
  });
  it("every board has exactly 2 tickets (uniform height)", () => {
    for (const b of LANDING_BOARDS) expect(b.tickets).toHaveLength(2);
  });
  it("has 2 priced (money) boards and 2 queue-only boards", () => {
    const priced = LANDING_BOARDS.filter((b) =>
      b.tickets.some((t) => t.payment !== undefined),
    ).map((b) => b.key);
    const queueOnly = LANDING_BOARDS.filter((b) =>
      b.tickets.every((t) => t.payment === undefined),
    ).map((b) => b.key);
    expect(priced).toEqual(["coffee", "payment"]);
    expect(queueOnly).toEqual(["icecream", "rush"]);
  });
  it("both ice-cream carts carry options on every ticket", () => {
    const carts = LANDING_BOARDS.filter(
      (b) => b.key === "icecream" || b.key === "rush",
    );
    for (const b of carts)
      for (const t of b.tickets)
        expect(t.lines.every((l) => (l.options?.length ?? 0) > 0)).toBe(true);
  });
});

describe("LandingBoard", () => {
  it("renders the header count and each ticket", () => {
    render(<LandingBoard board={LANDING_BOARDS[0]} />);
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByText("#0042")).toBeInTheDocument();
  });
});
