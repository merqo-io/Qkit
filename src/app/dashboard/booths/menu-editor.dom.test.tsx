// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MenuEditor,
  moveItemToGroup,
  reorderCategories,
  reorderMenuItems,
} from "./menu-editor";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { Entitlement } from "@/lib/plan";
import type { MenuCategory } from "@/lib/types";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
beforeEach(() => toast.mockClear());

const ENTITLEMENT: Entitlement = {
  tier: "pro",
  maxBooths: null,
  maxMenuItems: 100,
  maxOptionGroupsPerItem: 10,
  autoCloseHours: true,
  stockCaps: true,
  statsRanges: ["24h", "7d", "30d"],
};

const ITEM: MenuItemFormInput = {
  id: "latte",
  name: "Latte",
  description: "",
  price_cents: 500,
  available: true,
};

function Host() {
  const [items, setItems] = useState<MenuItemFormInput[]>([ITEM]);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={setItems}
      entitlement={ENTITLEMENT}
    />
  );
}

describe("reorderMenuItems", () => {
  const items: MenuItemFormInput[] = [
    { ...ITEM, id: "a", name: "A" },
    { ...ITEM, id: "b", name: "B" },
    { ...ITEM, id: "c", name: "C" },
  ];

  it("moves the active item to the dropped-on item's position", () => {
    const result = reorderMenuItems(items, "a", "c");
    expect(result.map((it) => it.id)).toEqual(["b", "c", "a"]);
  });

  it("returns the same array instance when dropped on itself", () => {
    expect(reorderMenuItems(items, "b", "b")).toBe(items);
  });

  it("returns the same array instance for an unknown id", () => {
    expect(reorderMenuItems(items, "a", "missing")).toBe(items);
  });
});

describe("moveItemToGroup", () => {
  const categories: MenuCategory[] = [
    { id: "drinks", label: "Drinks" },
    { id: "snacks", label: "Snacks" },
  ];
  const items: MenuItemFormInput[] = [
    { ...ITEM, id: "a", name: "A", category: "drinks" },
    { ...ITEM, id: "b", name: "B", category: "snacks" },
    { ...ITEM, id: "c", name: "C", category: "drinks" },
    { ...ITEM, id: "d", name: "D" },
  ];

  it("moves an item to sit after the target group's last member", () => {
    const result = moveItemToGroup(items, categories, "d", "drinks");
    expect(result.map((it) => it.id)).toEqual(["a", "b", "c", "d"]);
    expect(result.find((it) => it.id === "d")?.category).toBe("drinks");
  });

  it("moves an item to the end when the target group is empty", () => {
    const emptyTargetCats: MenuCategory[] = [
      ...categories,
      { id: "combos", label: "Combos" },
    ];
    const result = moveItemToGroup(items, emptyTargetCats, "a", "combos");
    expect(result.map((it) => it.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("inserts mid-array, right after the target group's last member", () => {
    const result = moveItemToGroup(items, categories, "b", "drinks");
    expect(result.map((it) => it.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves an item to no-section (null) when dropped on that bucket", () => {
    const result = moveItemToGroup(items, categories, "a", null);
    expect(result.find((it) => it.id === "a")?.category).toBeNull();
  });

  it("returns the same array instance when already in the target group", () => {
    expect(moveItemToGroup(items, categories, "a", "drinks")).toBe(items);
  });

  it("returns the same array instance for an unknown id", () => {
    expect(moveItemToGroup(items, categories, "missing", "drinks")).toBe(items);
  });
});

describe("reorderCategories", () => {
  const categories: MenuCategory[] = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ];

  it("moves the active section to the dropped-on section's position", () => {
    const result = reorderCategories(categories, "a", "c");
    expect(result.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("returns the same array instance when dropped on itself", () => {
    expect(reorderCategories(categories, "b", "b")).toBe(categories);
  });

  it("returns the same array instance for an unknown id", () => {
    expect(reorderCategories(categories, "a", "missing")).toBe(categories);
  });
});

function HostWithTwo() {
  const [items, setItems] = useState<MenuItemFormInput[]>([
    { ...ITEM, id: "a", name: "A" },
    { ...ITEM, id: "b", name: "B" },
  ]);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={setItems}
      entitlement={ENTITLEMENT}
    />
  );
}

describe("MenuEditor drag handle", () => {
  it("renders one reorder handle per item", () => {
    render(<HostWithTwo />);
    expect(
      screen.getAllByRole("button", { name: "Reorder item" }),
    ).toHaveLength(2);
  });
});

describe("MenuEditor item-level allergens", () => {
  it("hides the allergen checkboxes behind a collapsed Advanced toggle by default", () => {
    render(<Host />);
    expect(screen.queryByText(/dairy/i)).not.toBeInTheDocument();
  });

  it("reveals allergen checkboxes when Advanced is expanded", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: /advanced/i }));
    expect(screen.getByText(/dairy/i)).toBeInTheDocument();
  });

  it("renders an icon next to each allergen checkbox label", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: /advanced/i }));
    expect(screen.getByText("🥛")).toBeInTheDocument();
    expect(screen.getByText("🥜")).toBeInTheDocument();
  });
});

describe("MenuEditor allergen summary badges", () => {
  it("shows no icon summary when the item has no allergens set", () => {
    render(<Host />);
    expect(
      screen.queryByLabelText(/contains allergens/i),
    ).not.toBeInTheDocument();
  });

  it("shows an icon-only summary next to the item header when allergens are set", () => {
    function HostWithAllergen() {
      const [items, setItems] = useState<MenuItemFormInput[]>([
        { ...ITEM, allergens: ["dairy", "nuts"] },
      ]);
      return (
        <MenuEditor
          vendorId="v1"
          items={items}
          onChange={setItems}
          entitlement={ENTITLEMENT}
        />
      );
    }
    render(<HostWithAllergen />);
    const summary = screen.getByLabelText(/contains allergens: dairy, nuts/i);
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent("🥛");
    expect(summary).toHaveTextContent("🌰");
    // Collapsed by default — the summary is visible without expanding Advanced.
    expect(screen.queryByText(/dairy/i)).not.toBeInTheDocument();
  });
});

const ITEM_WITH_GROUPS: MenuItemFormInput = {
  id: "latte",
  name: "Latte",
  description: "",
  price_cents: 500,
  available: true,
  allergens: ["dairy"],
  option_groups: [
    {
      id: "size",
      label: "Size",
      choices: [{ id: "s", label: "Small" }],
    },
  ],
};

function HostWithGroups({
  onChange,
}: {
  onChange?: (items: MenuItemFormInput[]) => void;
}) {
  const [items, setItems] = useState<MenuItemFormInput[]>([ITEM_WITH_GROUPS]);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={(next) => {
        setItems(next);
        onChange?.(next);
      }}
      entitlement={ENTITLEMENT}
    />
  );
}

const CATEGORIES: MenuCategory[] = [
  { id: "drinks", label: "Drinks" },
  { id: "snacks", label: "Snacks" },
];

function HostWithCategories() {
  const [items, setItems] = useState<MenuItemFormInput[]>([ITEM]);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={setItems}
      entitlement={ENTITLEMENT}
      categories={CATEGORIES}
    />
  );
}

describe("MenuEditor category picker", () => {
  it("shows nothing when there are no categories", () => {
    render(<Host />);
    expect(screen.queryByText("Section")).not.toBeInTheDocument();
  });

  it("shows a section picker, defaulting to No section", () => {
    render(<HostWithCategories />);
    expect(screen.getByText("Section")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("No section");
  });

  it("picking a section updates the item's category", async () => {
    const user = userEvent.setup();
    render(<HostWithCategories />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Snacks" }));
    expect(screen.getByRole("combobox")).toHaveTextContent("Snacks");
  });
});

describe("MenuEditor availability toggle", () => {
  it("renders Available as a switch, checked by default", () => {
    render(<Host />);
    expect(screen.getByRole("switch", { name: "Available" })).toBeChecked();
  });

  it("toggling it flips the item's available flag", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("switch", { name: "Available" }));
    expect(screen.getByRole("switch", { name: "Available" })).not.toBeChecked();
  });
});

describe("MenuEditor field labels", () => {
  it("names each money and stock field by its visible label", () => {
    render(<Host />);
    for (const label of ["Price", "Cost", "Sold-out limit"])
      expect(screen.getAllByLabelText(label)[0]).toBeInstanceOf(
        HTMLInputElement,
      );
  });
});

describe("MenuEditor price input", () => {
  // Regression: a fully-reformatted-every-keystroke controlled input resets
  // the caret to the end after each key, so typing "6.50" left-to-right used
  // to land as "6.01" (each digit appended past the fixed decimal point).
  it("keeps the exact typed value when typed left-to-right, one key at a time", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const price = screen.getAllByPlaceholderText("Optional")[0]!;
    await user.clear(price);
    await user.type(price, "6.50");
    await user.tab();
    expect(price).toHaveValue("6.50");
  });
});

// Duplicate/Remove live behind a per-item "More actions" kebab menu.
async function openItemMenu(user: ReturnType<typeof userEvent.setup>, at = 0) {
  await user.click(
    screen.getAllByRole("button", { name: "More actions" })[at]!,
  );
}

describe("MenuEditor remove item", () => {
  it("removes the item and offers an Undo toast", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openItemMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /remove/i }));

    expect(screen.queryByPlaceholderText("Item name")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      "Latte removed",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("Undo restores the item without clobbering an edit made in between", async () => {
    const user = userEvent.setup();
    render(<HostWithTwo />);
    await openItemMenu(user, 0);
    await user.click(screen.getByRole("menuitem", { name: /remove/i }));
    // Edit the surviving item after the removal, before clicking Undo.
    const remainingName = screen.getByPlaceholderText("Item name");
    await user.clear(remainingName);
    await user.type(remainingName, "B edited");

    const restore = toast.mock.calls[0]![1].action.onClick;
    act(() => restore());

    const names = screen
      .getAllByPlaceholderText("Item name")
      .map((el) => (el as HTMLInputElement).value);
    expect(names).toEqual(["A", "B edited"]);
  });
});

describe("MenuEditor duplicate item", () => {
  it("creates an independent copy with a distinct name and id", async () => {
    const user = userEvent.setup();
    const changed = vi.fn<(items: MenuItemFormInput[]) => void>();
    render(<HostWithGroups onChange={changed} />);
    await openItemMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /duplicate/i }));
    const names = screen.getAllByPlaceholderText("Item name");
    expect(names).toHaveLength(2);
    expect((names[1] as HTMLInputElement).value).toBe("Latte (copy)");
    const [original, copy] = changed.mock.lastCall![0];
    expect(original.id).toBe("latte");
    expect(copy.id).not.toBe(original.id);
    expect(copy.id).not.toBe("");
  });

  it("editing the copy's name never mutates the original", async () => {
    const user = userEvent.setup();
    render(<HostWithGroups />);
    await openItemMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /duplicate/i }));
    const names = screen.getAllByPlaceholderText("Item name");
    await user.clear(names[1]);
    await user.type(names[1], "Cappuccino");
    expect((names[0] as HTMLInputElement).value).toBe("Latte");
  });

  it("carries over option groups and allergens as independent data", async () => {
    const user = userEvent.setup();
    const changed = vi.fn<(items: MenuItemFormInput[]) => void>();
    render(<HostWithGroups onChange={changed} />);
    await openItemMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /duplicate/i }));
    const advancedButtons = screen.getAllByRole("button", {
      name: /advanced/i,
    });
    await user.click(advancedButtons[1]);
    expect(screen.getAllByText(/dairy/i).length).toBeGreaterThan(0);
    const customizationButtons = screen.getAllByRole("button", {
      name: /customization/i,
    });
    expect(customizationButtons[1]).toHaveTextContent("1");
    const [original, copy] = changed.mock.calls[0][0];
    expect(copy.option_groups).toEqual(original.option_groups);
    expect(copy.option_groups).not.toBe(original.option_groups);
    expect(copy.option_groups![0].choices).not.toBe(
      original.option_groups![0].choices,
    );
    expect(copy.allergens).toEqual(original.allergens);
    expect(copy.allergens).not.toBe(original.allergens);
  });

  it("disables duplication once the menu-item cap is reached", async () => {
    const user = userEvent.setup();
    render(
      <MenuEditor
        vendorId="v1"
        items={[ITEM_WITH_GROUPS]}
        onChange={() => {}}
        entitlement={{ ...ENTITLEMENT, maxMenuItems: 1 }}
      />,
    );
    await openItemMenu(user);
    expect(
      screen.getByRole("menuitem", { name: /duplicate/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

function HostSections({
  initialCategories = [],
}: {
  initialCategories?: MenuCategory[];
}) {
  const [items, setItems] = useState<MenuItemFormInput[]>([ITEM]);
  const [categories, setCategories] =
    useState<MenuCategory[]>(initialCategories);
  return (
    <MenuEditor
      vendorId="v1"
      items={items}
      onChange={setItems}
      entitlement={ENTITLEMENT}
      categories={categories}
      onCategoriesChange={setCategories}
    />
  );
}

describe("MenuEditor sections", () => {
  it("renders no section chrome when there are no sections", () => {
    render(<HostSections />);
    expect(screen.queryByText("No section")).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Section name"),
    ).not.toBeInTheDocument();
  });

  it("adding a section shows an empty, renameable group", async () => {
    const user = userEvent.setup();
    render(<HostSections />);
    await user.click(screen.getByRole("button", { name: "Add section" }));
    expect(screen.getByPlaceholderText("Section name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder section" }),
    ).toBeInTheDocument();
    // The one existing item has no section, so it sits in a "No section"
    // group — its own Section picker also defaults to that same label.
    expect(screen.getAllByText("No section").length).toBeGreaterThan(0);
  });

  it("renaming a section updates its label", async () => {
    const user = userEvent.setup();
    render(<HostSections initialCategories={CATEGORIES} />);
    const drinksInput = screen.getByDisplayValue("Drinks");
    await user.clear(drinksInput);
    await user.type(drinksInput, "Coffee");
    expect(screen.getByDisplayValue("Coffee")).toBeInTheDocument();
  });

  it("removing a section drops its chrome and offers an Undo toast, items stay put", async () => {
    const user = userEvent.setup();
    render(<HostSections initialCategories={CATEGORIES} />);
    const removeButtons = screen.getAllByRole("button", {
      name: "Remove section",
    });
    await user.click(removeButtons[0]!);

    expect(screen.queryByDisplayValue("Drinks")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      "Drinks removed",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
    // The lone item was already unassigned — still visible, untouched.
    expect(screen.getByPlaceholderText("Item name")).toBeInTheDocument();
  });

  it("collapsing a section hides its items behind a count, expanding restores them", async () => {
    const user = userEvent.setup();
    function HostSectionsWithItem() {
      const [items, setItems] = useState<MenuItemFormInput[]>([
        { ...ITEM, category: "drinks" },
      ]);
      const [categories, setCategories] = useState<MenuCategory[]>([
        { id: "drinks", label: "Drinks" },
      ]);
      return (
        <MenuEditor
          vendorId="v1"
          items={items}
          onChange={setItems}
          entitlement={ENTITLEMENT}
          categories={categories}
          onCategoriesChange={setCategories}
        />
      );
    }
    render(<HostSectionsWithItem />);
    expect(screen.getByPlaceholderText("Item name")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse section" }));
    expect(screen.queryByPlaceholderText("Item name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand section" }));
    expect(screen.getByPlaceholderText("Item name")).toBeInTheDocument();
  });

  it("disables Add section once the section cap is reached", () => {
    const atCap: MenuCategory[] = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      label: `Section ${i}`,
    }));
    render(<HostSections initialCategories={atCap} />);
    expect(screen.getByRole("button", { name: "Add section" })).toBeDisabled();
  });
});
