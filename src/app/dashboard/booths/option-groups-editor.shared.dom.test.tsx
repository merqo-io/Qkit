// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OptionGroupsEditor } from "./option-groups-editor";
import type { OptionGroup } from "@/lib/types";
import type { Entitlement } from "@/lib/plan";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));
vi.mock("@/app/actions/events", () => ({ logEvent: vi.fn() }));

const BASE: Entitlement = {
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

const SUGAR: OptionGroup = {
  id: "lib-sugar",
  label: "Sugar level",
  choices: [
    { id: "c0", label: "0%" },
    { id: "c50", label: "50%" },
  ],
};

function Host({
  initial = [],
  initialLibrary = [SUGAR],
  entitlement = BASE,
  onEditShared = () => {},
  spyLibrary,
}: {
  initial?: OptionGroup[];
  initialLibrary?: OptionGroup[];
  entitlement?: Entitlement;
  onEditShared?: (id: string) => void;
  spyLibrary?: (lib: OptionGroup[]) => void;
}) {
  const [groups, setGroups] = useState(initial);
  const [library, setLibrary] = useState(initialLibrary);
  return (
    <OptionGroupsEditor
      groups={groups}
      onChange={setGroups}
      entitlement={entitlement}
      itemAllergens={[]}
      library={library}
      onLibraryChange={(next) => {
        setLibrary(next);
        spyLibrary?.(next);
      }}
      onEditShared={onEditShared}
    />
  );
}

describe("OptionGroupsEditor saved groups", () => {
  it("attaches a saved group as a read-only Shared group", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: /Add saved group/ }));
    await user.click(screen.getByRole("button", { name: /Sugar level/ }));

    const card = screen.getByTestId("shared-group");
    expect(card).toHaveTextContent("Sugar level");
    expect(card).toHaveTextContent("Shared");
    expect(screen.queryByLabelText("Option group name")).toBeNull();
  });

  it("disables a saved group whose label the item already has", async () => {
    const user = userEvent.setup();
    render(
      <Host
        initial={[
          {
            id: "own",
            label: "sugar level",
            choices: [{ id: "x", label: "A" }],
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Add saved group/ }));
    expect(screen.getByRole("button", { name: /Sugar level/ })).toBeDisabled();
  });

  it("hides the picker once the free per-item cap is reached", () => {
    render(
      <Host
        entitlement={{ ...BASE, maxOptionGroupsPerItem: 1 }}
        initial={[
          { id: "own", label: "Size", choices: [{ id: "x", label: "S" }] },
        ]}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Add saved group/ }),
    ).toBeNull();
    expect(screen.getByText(/1-group limit per item/)).toBeInTheDocument();
  });

  it("calls onEditShared with the library id on Edit for all", async () => {
    const user = userEvent.setup();
    const onEditShared = vi.fn();
    render(
      <Host
        initial={[{ ...SUGAR, id: "copy", shared_id: "lib-sugar" }]}
        onEditShared={onEditShared}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit for all" }));
    expect(onEditShared).toHaveBeenCalledWith("lib-sugar");
  });

  it("unlinks a shared group into an editable item-only copy", async () => {
    const user = userEvent.setup();
    render(
      <Host initial={[{ ...SUGAR, id: "copy", shared_id: "lib-sugar" }]} />,
    );
    await user.click(screen.getByRole("button", { name: "Unlink" }));

    expect(screen.queryByTestId("shared-group")).toBeNull();
    expect(screen.getByLabelText("Option group name")).toHaveValue(
      "Sugar level",
    );
  });

  it("saves an item-only group as reusable and links it", async () => {
    const user = userEvent.setup();
    const spyLibrary = vi.fn();
    render(
      <Host
        initialLibrary={[]}
        spyLibrary={spyLibrary}
        initial={[
          { id: "own", label: "Size", choices: [{ id: "x", label: "Small" }] },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save as reusable" }));

    expect(spyLibrary).toHaveBeenCalledWith([
      expect.objectContaining({ label: "Size" }),
    ]);
    expect(screen.getByTestId("shared-group")).toHaveTextContent("Shared");
  });

  it("toasts when the library already has that label", async () => {
    const user = userEvent.setup();
    render(
      <Host
        initial={[
          {
            id: "own",
            label: "Sugar level",
            choices: [{ id: "x", label: "A" }],
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save as reusable" }));
    expect(toastError).toHaveBeenCalledWith(
      'The library already has a "Sugar level" group',
    );
  });
});
