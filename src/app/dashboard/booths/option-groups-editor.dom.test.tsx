// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OptionGroupsEditor } from "./option-groups-editor";
import type { OptionGroup } from "@/lib/types";
import type { Entitlement } from "@/lib/plan";
import type { AllergenTag } from "@/lib/schemas";

const ENTITLEMENT: Entitlement = {
  tier: "qkit",
  maxBooths: null,
  maxMenuItems: 100,
  maxOptionGroupsPerItem: 10,
  autoCloseHours: true,
  stockCaps: true,
  statsRanges: ["24h", "7d", "30d", "90d"],
  founder: false,
  eventPass: null,
  counterOps: true,
  statsSince: null,
};

function Host({
  initial,
  itemAllergens = [],
  onChange,
}: {
  initial: OptionGroup[];
  itemAllergens?: AllergenTag[];
  onChange?: (groups: OptionGroup[]) => void;
}) {
  const [groups, setGroups] = useState(initial);
  return (
    <OptionGroupsEditor
      groups={groups}
      onChange={(next) => {
        setGroups(next);
        onChange?.(next);
      }}
      entitlement={ENTITLEMENT}
      itemAllergens={itemAllergens}
    />
  );
}

const MILK_GROUP: OptionGroup = {
  id: "milk",
  label: "Milk",
  choices: [
    { id: "reg", label: "Regular" },
    { id: "oat", label: "Oat Milk" },
  ],
};

describe("OptionGroupsEditor price input", () => {
  it("shows a price input next to each choice, always visible", () => {
    render(<Host initial={[MILK_GROUP]} />);
    expect(
      screen.getAllByPlaceholderText(/price/i).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("setting a choice's price updates that choice's price_delta_cents", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<Host initial={[MILK_GROUP]} onChange={changed} />);
    const priceInputs = screen.getAllByPlaceholderText(/price/i);
    // Second choice is "Oat Milk".
    await user.type(priceInputs[1], "1.00");
    // A subsequent "Add choice" click re-renders from the updated state —
    // simplest observable proof is re-querying the input's own value.
    expect(priceInputs[1]).toHaveValue("1.00");
    expect(changed).toHaveBeenLastCalledWith([
      expect.objectContaining({
        choices: [
          { id: "reg", label: "Regular" },
          { id: "oat", label: "Oat Milk", price_delta_cents: 100 },
        ],
      }),
    ]);
  });

  // Regression: a fully-reformatted-every-keystroke controlled input resets
  // the caret to the end after each key, so typing "6.50" left-to-right used
  // to land as "6.01" (each digit appended past the fixed decimal point).
  // ".00"-ending values like the test above don't expose this.
  it("keeps the exact typed value when typed left-to-right, one key at a time", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    const priceInputs = screen.getAllByPlaceholderText(/price/i);
    await user.type(priceInputs[1], "6.50");
    await user.tab();
    expect(priceInputs[1]).toHaveValue("6.50");
  });
});

describe("OptionGroupsEditor advanced section", () => {
  it("hides cost and allergen fields behind a collapsed Advanced toggle by default", () => {
    render(<Host initial={[MILK_GROUP]} />);
    expect(screen.queryByPlaceholderText(/cost/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dairy/i)).not.toBeInTheDocument();
  });

  it("reveals cost and allergen fields when Advanced is expanded", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    const advancedToggles = screen.getAllByRole("button", {
      name: /advanced/i,
    });
    await user.click(advancedToggles[0]);
    expect(screen.getAllByPlaceholderText(/cost/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/dairy/i)).toBeInTheDocument();
  });

  it("shows an icon next to each allergen, and a scope caption", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    await user.click(screen.getAllByRole("button", { name: /advanced/i })[0]!);
    expect(screen.getByText("🥛")).toBeInTheDocument();
    expect(screen.getByText("🥜")).toBeInTheDocument();
    expect(
      screen.getByText(/only when this choice is picked/i),
    ).toBeInTheDocument();
  });
});

describe("OptionGroupsEditor group collapse", () => {
  it("starts expanded, with no choice-count badge shown", () => {
    render(<Host initial={[MILK_GROUP]} />);
    expect(screen.getAllByPlaceholderText("Choice (e.g. Small)")).toHaveLength(
      2,
    );
    expect(screen.queryByText(/2 choices/i)).not.toBeInTheDocument();
  });

  it("collapsing hides the choices and shows a choice-count badge", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    await user.click(screen.getByRole("button", { name: /collapse group/i }));

    expect(
      screen.queryByPlaceholderText("Choice (e.g. Small)"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 choices")).toBeInTheDocument();
    // The group's own identity stays interactive while collapsed.
    expect(screen.getByPlaceholderText(/group name/i)).toBeInTheDocument();
  });

  it("expanding again restores the choices", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    await user.click(screen.getByRole("button", { name: /collapse group/i }));
    await user.click(screen.getByRole("button", { name: /expand group/i }));

    expect(screen.getAllByPlaceholderText("Choice (e.g. Small)")).toHaveLength(
      2,
    );
  });
});

describe("OptionGroupsEditor advanced modal", () => {
  it("opens exactly one choice's Advanced dialog, scoped to that choice", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    const triggers = screen.getAllByRole("button", { name: /advanced/i });

    await user.click(triggers[0]!);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: /Regular/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(triggers[1]!);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: /Oat Milk/i }),
    ).toBeInTheDocument();
  });

  it("closes the dialog via Done", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    await user.click(screen.getAllByRole("button", { name: /advanced/i })[0]!);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks the trigger once a choice has cost or an allergen set", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    const trigger = screen.getAllByRole("button", { name: /advanced/i })[0]!;
    expect(trigger.querySelector('[aria-hidden="true"].bg-primary')).toBeNull();

    await user.click(trigger);
    await user.click(screen.getAllByLabelText(/dairy/i)[0]!);
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(
      trigger.querySelector('[aria-hidden="true"].bg-primary'),
    ).not.toBeNull();
  });
});

describe("OptionGroupsEditor ticket short code", () => {
  it("offers a suggestion from the choice's initials without applying it", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    await user.click(screen.getAllByRole("button", { name: /advanced/i })[1]!);

    const code = screen.getByLabelText("Short code on the order ticket");
    // "Oat Milk" suggests "OM", but only as a placeholder: an unset code means
    // the ticket prints the choice in full, never a guess.
    expect(code).toHaveAttribute("placeholder", "OM");
    expect(code).toHaveValue("");
  });

  it("keeps the code the vendor types and marks the choice as customised", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    const trigger = screen.getAllByRole("button", { name: /advanced/i })[1]!;
    await user.click(trigger);

    await user.type(
      screen.getByLabelText("Short code on the order ticket"),
      "OAT",
    );
    expect(screen.getByLabelText("Short code on the order ticket")).toHaveValue(
      "OAT",
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(
      trigger.querySelector('[aria-hidden="true"].bg-primary'),
    ).not.toBeNull();
  });
});

describe("OptionGroupsEditor customer-sees preview", () => {
  it("shows nothing when neither the item nor the choice has allergens", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    await user.click(screen.getAllByRole("button", { name: /advanced/i })[0]!);
    expect(screen.queryByText(/customer sees/i)).not.toBeInTheDocument();
  });

  it("appears once a choice allergen is checked, with its icon", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} />);
    await user.click(screen.getAllByRole("button", { name: /advanced/i })[0]!);
    await user.click(screen.getAllByLabelText(/dairy/i)[0]!);

    expect(screen.getByText(/customer sees/i)).toBeInTheDocument();
    const preview = screen.getByRole("status", { name: /contains allergens/i });
    expect(preview).toHaveTextContent("dairy");
    expect(preview).toHaveTextContent("🥛");
  });

  it("unions the item's own allergens into the preview, even with no choice allergens checked", async () => {
    const user = userEvent.setup();
    render(<Host initial={[MILK_GROUP]} itemAllergens={["gluten"]} />);
    await user.click(screen.getAllByRole("button", { name: /advanced/i })[0]!);

    const preview = screen.getByRole("status", { name: /contains allergens/i });
    expect(preview).toHaveTextContent("gluten");
  });
});
