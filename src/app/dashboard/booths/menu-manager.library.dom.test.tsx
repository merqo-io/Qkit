// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuManager } from "./menu-manager";
import type { Entitlement } from "@/lib/plan";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { OptionGroup } from "@/lib/types";

const { saveMenuItems, saveMenuCategories, saveModifierGroups } = vi.hoisted(
  () => ({
    saveMenuItems: vi.fn(),
    saveMenuCategories: vi.fn(),
    saveModifierGroups: vi.fn(),
  }),
);
vi.mock("./actions", () => ({
  saveMenuItems,
  saveMenuCategories,
  saveModifierGroups,
}));
vi.mock("@/app/actions/events", () => ({ logEvent: vi.fn() }));

vi.mock("./menu-editor", () => ({
  MenuEditor: ({ items }: { items: MenuItemFormInput[] }) => (
    <ul>
      {items.map((it) => (
        <li key={it.id} data-testid={`item-${it.id}`}>
          {(it.option_groups ?? [])
            .map((g) => `${g.label}:${g.shared_id ?? "own"}`)
            .join(",")}
        </li>
      ))}
    </ul>
  ),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: toastSuccess }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const PRO: Entitlement = {
  tier: "qkit",
  maxBooths: null,
  maxMenuItems: null,
  maxOptionGroupsPerItem: null,
  autoCloseHours: true,
  stockCaps: true,
  statsRanges: ["24h"],
  founder: false,
  eventPass: null,
  counterOps: true,
  statsSince: null,
};
const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

const SUGAR: OptionGroup = {
  id: "lib-sugar",
  label: "Sugar level",
  choices: [{ id: "c0", label: "0%" }],
};

function item(id: string, groups: OptionGroup[]): MenuItemFormInput {
  return {
    id,
    name: id,
    description: "",
    price_cents: 100,
    image_url: null,
    available: true,
    option_groups: groups,
  };
}

function renderManager() {
  render(
    <MenuManager
      vendorId="v1"
      boothId={BOOTH_ID}
      boothName="Cart"
      entitlement={PRO}
      initialLibrary={[SUGAR]}
      initialItems={[
        item("a", [{ ...SUGAR, id: "ga", shared_id: "lib-sugar" }]),
        item("b", [{ ...SUGAR, id: "gb", shared_id: "lib-sugar" }]),
      ]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  saveMenuItems.mockResolvedValue({ success: true });
  saveMenuCategories.mockResolvedValue({ success: true });
  saveModifierGroups.mockResolvedValue({ success: true });
});

describe("MenuManager reusable groups", () => {
  it("deleting a library group unlinks every item copy but keeps it", async () => {
    const user = userEvent.setup();
    renderManager();
    expect(screen.getByTestId("item-a")).toHaveTextContent(
      "Sugar level:lib-sugar",
    );
    await user.click(screen.getByRole("button", { name: "Remove group" }));
    await user.click(screen.getByRole("button", { name: "Delete group" }));

    expect(screen.getByTestId("item-a")).toHaveTextContent("Sugar level:own");
    expect(screen.getByTestId("item-b")).toHaveTextContent("Sugar level:own");
  });

  it("renames linked copies live and saves the library", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.type(screen.getByLabelText("Option group name"), "s");
    expect(screen.getByTestId("item-a")).toHaveTextContent(
      "Sugar levels:lib-sugar",
    );
    await user.click(
      screen.getByRole("button", { name: "Save reusable groups" }),
    );

    await waitFor(() =>
      expect(saveModifierGroups).toHaveBeenCalledWith(BOOTH_ID, [
        expect.objectContaining({ label: "Sugar levels" }),
      ]),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Reusable groups saved");
  });

  it("toasts the reload error when the library save conflicts", async () => {
    const user = userEvent.setup();
    saveModifierGroups.mockResolvedValue({
      success: false,
      error: "The menu changed elsewhere. Reload the page.",
    });
    renderManager();
    await user.type(screen.getByLabelText("Option group name"), "s");
    await user.click(
      screen.getByRole("button", { name: "Save reusable groups" }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "The menu changed elsewhere. Reload the page.",
      ),
    );
  });

  it("saves the library before the items and stops if it conflicts", async () => {
    const user = userEvent.setup();
    saveModifierGroups.mockResolvedValue({ success: false, error: "Reload" });
    renderManager();
    await user.type(screen.getByLabelText("Option group name"), "s");
    await user.click(screen.getByRole("button", { name: "Save menu" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Reload"));
    expect(saveMenuItems).not.toHaveBeenCalled();
  });
});
