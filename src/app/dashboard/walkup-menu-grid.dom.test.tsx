// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalkupMenuSection } from "./walkup-menu-grid";
import { menuItemActionLabel } from "@/lib/utils";
import type { MenuItem } from "@/lib/types";

const add = menuItemActionLabel(false, false);
const customize = menuItemActionLabel(false, true);

function renderGrid(item: Partial<MenuItem>) {
  return render(
    <WalkupMenuSection
      boothCount={1}
      loading={false}
      menuItems={[
        { id: "1", name: "Teh", price_cents: 200, ...item } as MenuItem,
      ]}
      cart={new Map()}
      remaining={{} as never}
      onDecrement={vi.fn()}
      onIncrement={vi.fn()}
      onAddClick={vi.fn()}
    />,
  );
}

describe("WalkupMenuSection", () => {
  it("offers Add when the item has no option groups", () => {
    renderGrid({});
    expect(screen.getByRole("button", { name: add })).toBeInTheDocument();
  });

  it("offers Add when every option group has no choices", () => {
    renderGrid({ option_groups: [{ id: "g", label: "Ice", choices: [] }] });
    expect(screen.getByRole("button", { name: add })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: customize }),
    ).not.toBeInTheDocument();
  });

  it("offers Customize when a group has choices", () => {
    renderGrid({
      option_groups: [
        { id: "g", label: "Ice", choices: [{ id: "c", label: "Less ice" }] },
      ],
    });
    expect(screen.getByRole("button", { name: customize })).toBeInTheDocument();
  });
});
