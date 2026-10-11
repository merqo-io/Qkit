// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemCustomizer } from "./item-customizer";
import type { MenuItem } from "@/lib/types";

const LATTE: MenuItem = {
  id: "latte",
  name: "Latte",
  description: "",
  price_cents: 500,
  available: true,
  // Fixed ingredient (unrelated to milk choice) — always present.
  allergens: ["caffeine"],
  option_groups: [
    {
      id: "milk",
      label: "Milk",
      choices: [
        { id: "reg", label: "Regular", allergens: ["dairy"] },
        { id: "oat", label: "Oat Milk", price_delta_cents: 100 },
      ],
    },
    {
      id: "addons",
      label: "Add-ons",
      multiple: true,
      choices: [
        { id: "shot", label: "Extra Shot", price_delta_cents: 80 },
        { id: "syrup", label: "Almond Syrup", allergens: ["nuts"] },
      ],
    },
  ],
};

// The running total is the footer's paragraph; a priced chip carries its own
// price in a span.
const FOOTER_TOTAL = { selector: "p" };

function renderCustomizer(onAdd = vi.fn()) {
  return {
    onAdd,
    ...render(<ItemCustomizer item={LATTE} onClose={vi.fn()} onAdd={onAdd} />),
  };
}

describe("ItemCustomizer running total", () => {
  it("shows no extra charge with only the free default selected", () => {
    renderCustomizer();
    expect(screen.queryByText(/^\+\$\d/, FOOTER_TOTAL)).not.toBeInTheDocument();
  });

  it("shows the delta when a priced single-select choice is picked", async () => {
    const user = userEvent.setup();
    renderCustomizer();
    await user.click(screen.getByRole("radio", { name: /Oat Milk/ }));
    expect(screen.getByText("+$1.00", FOOTER_TOTAL)).toBeInTheDocument();
  });

  it("replaces rather than adds when switching within a single-select group", async () => {
    const user = userEvent.setup();
    renderCustomizer();
    await user.click(screen.getByRole("radio", { name: /Oat Milk/ }));
    expect(screen.getByText("+$1.00", FOOTER_TOTAL)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Regular" }));
    expect(screen.queryByText(/^\+\$\d/, FOOTER_TOTAL)).not.toBeInTheDocument();
  });

  it("sums multiple selected choices across groups", async () => {
    const user = userEvent.setup();
    renderCustomizer();
    await user.click(screen.getByRole("radio", { name: /Oat Milk/ }));
    await user.click(screen.getByRole("button", { name: /Extra Shot/ }));
    // Oat Milk (+$1.00) + Extra Shot (+$0.80) = +$1.80.
    expect(screen.getByText("+$1.80", FOOTER_TOTAL)).toBeInTheDocument();
  });
});

describe("ItemCustomizer choice prices", () => {
  it("shows what a priced choice adds on the choice itself, before it is picked", () => {
    renderCustomizer();
    expect(
      screen.getByRole("radio", { name: "Oat Milk +$1.00" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Extra Shot +$0.80" }),
    ).toBeInTheDocument();
  });

  it("adds nothing to a free choice's label", () => {
    renderCustomizer();
    expect(screen.getByRole("radio", { name: "Regular" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Almond Syrup" }),
    ).toBeInTheDocument();
  });
});

describe("ItemCustomizer allergen badges", () => {
  it("always shows the item's fixed allergens", () => {
    renderCustomizer();
    expect(screen.getByText(/caffeine/i)).toBeInTheDocument();
  });

  it("shows the default-selected choice's allergen (Regular Milk -> dairy)", () => {
    renderCustomizer();
    expect(screen.getByText(/dairy/i)).toBeInTheDocument();
  });

  it("drops an allergen when switching away from the choice that carried it", async () => {
    const user = userEvent.setup();
    renderCustomizer();
    expect(screen.getByText(/dairy/i)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Oat Milk/ }));
    expect(screen.queryByText(/dairy/i)).not.toBeInTheDocument();
  });

  it("adds an allergen from a multi-select add-on choice", async () => {
    const user = userEvent.setup();
    renderCustomizer();
    expect(screen.queryByText(/nuts/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Almond Syrup" }));
    expect(screen.getByText(/nuts/i)).toBeInTheDocument();
  });
});
