// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModifierLibrarySection } from "./modifier-library-section";
import type { OptionGroup } from "@/lib/types";
import type { Entitlement } from "@/lib/plan";

vi.mock("@/app/actions/events", () => ({ logEvent: vi.fn() }));

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
const FREE: Entitlement = { ...PRO, tier: "free", maxOptionGroupsPerItem: 3 };

const SUGAR: OptionGroup = {
  id: "lib-sugar",
  label: "Sugar level",
  choices: [{ id: "c0", label: "0%" }],
};

const items = [
  { option_groups: [{ ...SUGAR, id: "a", shared_id: "lib-sugar" }] },
  { option_groups: [{ ...SUGAR, id: "b", shared_id: "lib-sugar" }] },
  { option_groups: [] },
];

function setup(
  over: Partial<Parameters<typeof ModifierLibrarySection>[0]> = {},
) {
  const props = {
    library: [SUGAR],
    items,
    entitlement: PRO,
    dirty: false,
    saving: false,
    onChange: vi.fn(),
    onRemove: vi.fn(),
    onSave: vi.fn(),
    ...over,
  };
  render(<ModifierLibrarySection {...props} />);
  return props;
}

describe("ModifierLibrarySection", () => {
  it("shows how many items use each group and the update-all note", () => {
    setup();
    expect(screen.getByText(/Used by 2 items/)).toBeInTheDocument();
    expect(screen.getByText(/Changes update all 2 items/)).toBeInTheDocument();
  });

  it("states how many items a delete unlinks, then removes on confirm", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole("button", { name: "Remove group" }));

    expect(screen.getByText(/unlinks it from 2 items/)).toBeInTheDocument();
    expect(props.onRemove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete group" }));
    expect(props.onRemove).toHaveBeenCalledWith("lib-sugar");
  });

  it("does not remove when the delete is cancelled", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole("button", { name: "Remove group" }));
    await user.click(screen.getByRole("button", { name: "Keep group" }));
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("adds a blank group and saves through onSave", async () => {
    const user = userEvent.setup();
    const props = setup({ dirty: true });
    await user.click(
      screen.getByRole("button", { name: /New reusable group/ }),
    );
    expect(props.onChange).toHaveBeenCalledWith([
      SUGAR,
      expect.objectContaining({ label: "" }),
    ]);
    await user.click(
      screen.getByRole("button", { name: "Save reusable groups" }),
    );
    expect(props.onSave).toHaveBeenCalled();
  });

  it("is usable on the free plan", () => {
    setup({ entitlement: FREE });
    expect(
      screen.getByRole("button", { name: /New reusable group/ }),
    ).toBeEnabled();
    expect(screen.queryByText(/paid plans/)).toBeNull();
  });
});
