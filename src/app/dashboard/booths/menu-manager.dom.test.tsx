// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuManager } from "./menu-manager";
import type { Entitlement } from "@/lib/plan";
import type { MenuItemFormInput } from "@/lib/schemas";

const { saveMenuItems, saveMenuCategories } = vi.hoisted(() => ({
  saveMenuItems: vi.fn(),
  saveMenuCategories: vi.fn(),
}));
vi.mock("./actions", () => ({ saveMenuItems, saveMenuCategories }));

// MenuEditor's own add/edit/remove/reorder behavior is covered by
// menu-editor.dom.test.tsx — stub it here to a plain list so this file stays
// isolated to MenuManager's own state wiring (save/export/import).
vi.mock("./menu-editor", () => ({
  MenuEditor: ({ items }: { items: { id: string; name: string }[] }) => (
    <ul>
      {items.map((it) => (
        <li key={it.id}>{it.name}</li>
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

const routerReplace = vi.fn();
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));

const ENTITLEMENT: Entitlement = {
  tier: "free",
  maxBooths: 1,
  maxMenuItems: 6,
  maxOptionGroupsPerItem: 3,
  autoCloseHours: false,
  stockCaps: false,
  statsRanges: ["24h"],
};

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

function makeItem(over: Partial<MenuItemFormInput> = {}): MenuItemFormInput {
  return {
    id: "i1",
    name: "Kopi O",
    description: "",
    price_cents: 180,
    image_url: null,
    available: true,
    ...over,
  };
}

const originalObjectUrls = ["createObjectURL", "revokeObjectURL"].map(
  (key) => ({
    key,
    descriptor: Object.getOwnPropertyDescriptor(URL, key),
  }),
);

afterEach(() => {
  for (const { key, descriptor } of originalObjectUrls) {
    if (descriptor) Object.defineProperty(URL, key, descriptor);
    else Reflect.deleteProperty(URL, key);
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  saveMenuItems.mockResolvedValue({ success: true });
  saveMenuCategories.mockResolvedValue({ success: true });
  // jsdom has no object-URL support.
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

describe("MenuManager save", () => {
  it("saves the current items and navigates back to the booth on success", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[makeItem()]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save menu" }));

    await waitFor(() =>
      expect(saveMenuItems).toHaveBeenCalledWith(
        BOOTH_ID,
        expect.arrayContaining([expect.objectContaining({ name: "Kopi O" })]),
      ),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Menu saved");
    expect(routerReplace).toHaveBeenCalledWith(`/dashboard/booths/${BOOTH_ID}`);
  });

  it("routes to the QR page instead, on a new booth's first menu save", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[makeItem()]}
        isNewBooth
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save menu" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "Menu saved. Here's your QR to start taking orders.",
      ),
    );
    expect(routerReplace).toHaveBeenCalledWith(
      `/dashboard/booths/${BOOTH_ID}/qr`,
    );
  });

  it("also saves the category list alongside the items", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[makeItem()]}
        initialCategories={[{ id: "c1", label: "Drinks" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save menu" }));

    await waitFor(() =>
      expect(saveMenuCategories).toHaveBeenCalledWith(BOOTH_ID, [
        { id: "c1", label: "Drinks" },
      ]),
    );
  });

  it("shows a toast and does not navigate when the category save fails", async () => {
    saveMenuCategories.mockResolvedValue({
      success: false,
      error: "Invalid categories",
    });
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[makeItem()]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save menu" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Invalid categories"),
    );
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("shows a toast and does not navigate when the save fails", async () => {
    saveMenuItems.mockResolvedValue({
      success: false,
      error: "Your plan allows up to 6 menu items. Remove some or upgrade.",
    });
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[makeItem()]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save menu" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Your plan allows up to 6 menu items. Remove some or upgrade.",
      ),
    );
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

describe("MenuManager CSV export", () => {
  it("offers a template download instead of Export CSV with no items", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[]}
      />,
    );
    const button = screen.getByRole("button", { name: /Download template/ });
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("builds a CSV blob from the current items", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[makeItem()]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Export CSV/ }));
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });
});

describe("MenuManager CSV import", () => {
  function csvFile(text: string) {
    return new File([text], "menu.csv", { type: "text/csv" });
  }

  it("previews valid and invalid rows, then adds only the valid ones", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[]}
      />,
    );

    const csv =
      "name,description,price,cost,available\nTeh O,,1.20,,true\n,,1.00,,true";
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));

    expect(await screen.findByText(/1 of 2 rows ready/)).toBeInTheDocument();
    expect(screen.getByText(/Missing item name/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to menu" }));

    expect(await screen.findByText("Teh O")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Imported 1 item");
  });

  it("shows the description in the preview, not just name and price", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[]}
      />,
    );

    const csv =
      "name,description,price,cost,available\nKopi O,Local black coffee,1.80,,true";
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));

    expect(
      await screen.findByText("Kopi O (Local black coffee) $1.80"),
    ).toBeInTheDocument();
  });

  it("shows cost in the preview when set", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[]}
      />,
    );

    const csv = "name,description,price,cost,available\nKopi O,,1.80,0.60,true";
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));

    expect(
      await screen.findByText("Kopi O $1.80 (cost $0.60)"),
    ).toBeInTheDocument();
  });

  it("updates an existing item in place when the CSV name matches exactly", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[makeItem({ name: "Kopi O", price_cents: 180 })]}
      />,
    );

    const csv = "name,description,price,cost,available\nKopi O,,2.00,,true";
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));
    await user.click(
      await screen.findByRole("button", { name: "Add to menu" }),
    );

    // Still one row (updated, not duplicated).
    expect(await screen.findAllByText("Kopi O")).toHaveLength(1);
  });

  it("errors out instead of showing an empty preview for an empty file", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[]}
      />,
    );
    await user.upload(
      screen.getByLabelText("Import CSV"),
      csvFile("name,description,price,cost,available"),
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("No rows found in that file"),
    );
    expect(screen.queryByText(/rows ready/)).not.toBeInTheDocument();
  });
});

describe("MenuManager CSV customization import", () => {
  function csvFile(text: string) {
    return new File([text], "menu.csv", { type: "text/csv" });
  }

  const HEADER =
    "name,description,price,cost,available,group_name,group_type,choice_label,choice_price";

  it("shows a choice row nested under its item in the preview", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[]}
      />,
    );
    const csv = `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Style,one,O (black),`;
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));

    expect(await screen.findByText("Style: O (black)")).toBeInTheDocument();
  });

  it("builds option groups on a new item from its choice rows", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[]}
      />,
    );
    const csv = `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Style,one,O (black),`;
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));
    await user.click(
      await screen.findByRole("button", { name: "Add to menu" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save menu" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Save menu" }));
    await waitFor(() =>
      expect(saveMenuItems).toHaveBeenCalledWith(
        BOOTH_ID,
        expect.arrayContaining([
          expect.objectContaining({
            name: "Kopi",
            option_groups: [
              expect.objectContaining({
                label: "Style",
                multiple: false,
                choices: [expect.objectContaining({ label: "O (black)" })],
              }),
            ],
          }),
        ]),
      ),
    );
  });

  it("replaces an existing item's option groups when the file carries choice rows for it", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[
          makeItem({
            name: "Kopi",
            option_groups: [
              {
                id: "old",
                label: "Old group",
                choices: [{ id: "old-c", label: "Old choice" }],
              },
            ],
          }),
        ]}
      />,
    );
    const csv = `${HEADER}\nKopi,,,,true,,,,\n,,,,,Style,one,O (black),`;
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));
    await user.click(
      await screen.findByRole("button", { name: "Add to menu" }),
    );
    await user.click(screen.getByRole("button", { name: "Save menu" }));

    await waitFor(() =>
      expect(saveMenuItems).toHaveBeenCalledWith(
        BOOTH_ID,
        expect.arrayContaining([
          expect.objectContaining({
            name: "Kopi",
            option_groups: [expect.objectContaining({ label: "Style" })],
          }),
        ]),
      ),
    );
  });

  it("leaves an existing item's option groups untouched when the file has no choice rows for it", async () => {
    const user = userEvent.setup();
    const existingGroups = [
      { id: "old", label: "Old group", choices: [{ id: "c", label: "X" }] },
    ];
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[
          makeItem({ name: "Kopi", option_groups: existingGroups }),
        ]}
      />,
    );
    const csv = `${HEADER}\nKopi,,2.00,,true,,,,`;
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));
    await user.click(
      await screen.findByRole("button", { name: "Add to menu" }),
    );
    await user.click(screen.getByRole("button", { name: "Save menu" }));

    await waitFor(() =>
      expect(saveMenuItems).toHaveBeenCalledWith(
        BOOTH_ID,
        expect.arrayContaining([
          expect.objectContaining({
            name: "Kopi",
            price_cents: 200,
            option_groups: existingGroups,
          }),
        ]),
      ),
    );
  });

  it("flags a bad choice row without blocking its item's own import", async () => {
    const user = userEvent.setup();
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[]}
      />,
    );
    const csv = `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Style,one,O (black),free`;
    await user.upload(screen.getByLabelText("Import CSV"), csvFile(csv));

    expect(await screen.findByText(/Invalid choice price/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 rows ready/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to menu" }));
    expect(await screen.findByText("Kopi")).toBeInTheDocument();
  });
});

describe("MenuManager unsaved changes", () => {
  function renderManager() {
    render(
      <MenuManager
        vendorId="v1"
        boothId={BOOTH_ID}
        boothName="Kopitiam Cart"
        entitlement={ENTITLEMENT}
        initialItems={[makeItem()]}
      />,
    );
  }

  it("leaves on Cancel without asking when nothing was changed", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(`/dashboard/booths/${BOOTH_ID}`);
    confirm.mockRestore();
  });

  it("asks before Cancel throws away an edit, and stays when told to", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderManager();

    await user.upload(
      screen.getByLabelText("Import CSV"),
      new File(
        ["name,description,price,cost,available\nTeh O,,1.20,,true"],
        "menu.csv",
        { type: "text/csv" },
      ),
    );
    await user.click(
      await screen.findByRole("button", { name: "Add to menu" }),
    );
    expect(await screen.findByText("Teh O")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
