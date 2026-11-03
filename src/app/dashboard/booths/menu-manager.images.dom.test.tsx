// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Entitlement } from "@/lib/plan";
import type { MenuItemFormInput } from "@/lib/schemas";

const {
  saveMenuItems,
  saveMenuCategories,
  commitPendingImages,
  removeUnsavedImages,
  toastError,
} = vi.hoisted(() => ({
  saveMenuItems: vi.fn(),
  saveMenuCategories: vi.fn(),
  commitPendingImages: vi.fn(),
  removeUnsavedImages: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("./actions", () => ({ saveMenuItems, saveMenuCategories }));
vi.mock("./menu-editor", () => ({ MenuEditor: () => null }));
vi.mock("@/lib/image-upload-adapter", () => ({ removeUnsavedImages }));
vi.mock("@merqo/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@merqo/ui")>()),
  commitPendingImages,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { PendingImageUploadError } from "@merqo/ui";
import { MenuManager } from "./menu-manager";

const PREVIEW = "blob:http://localhost/photo";
const SAVED =
  "https://abc.supabase.co/storage/v1/object/public/booth-images/v1/saved.webp";
const UPLOADED =
  "https://abc.supabase.co/storage/v1/object/public/booth-images/v1/new.webp";

const ENTITLEMENT: Entitlement = {
  tier: "free",
  maxBooths: 1,
  maxMenuItems: 6,
  maxOptionGroupsPerItem: 3,
  autoCloseHours: false,
  stockCaps: false,
  statsRanges: ["24h"],
  founder: false,
  eventPass: null,
  counterOps: false,
  statsSince: null,
};

function item(id: string, image_url: string | null): MenuItemFormInput {
  return {
    id,
    name: id,
    description: "",
    price_cents: 180,
    image_url,
    available: true,
  };
}

function renderManager() {
  return render(
    <MenuManager
      vendorId="v1"
      boothId="00000000-0000-4000-8000-000000000001"
      boothName="Cart"
      initialItems={[item("a", PREVIEW), item("b", SAVED), item("c", null)]}
      initialCategories={[]}
      entitlement={ENTITLEMENT}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  saveMenuItems.mockResolvedValue({ success: true });
  saveMenuCategories.mockResolvedValue({ success: true });
  commitPendingImages.mockImplementation(async (values: unknown[]) => ({
    urls: values.map((v) => (v === PREVIEW ? UPLOADED : v)),
    uploaded: [UPLOADED],
  }));
});

async function save() {
  const user = userEvent.setup();
  renderManager();
  await user.click(screen.getByRole("button", { name: /save menu/i }));
}

// Item photos defer their uploads, so they reach storage only on Save.
describe("MenuManager deferred photo uploads", () => {
  it("uploads pending photos on save and saves their public URLs", async () => {
    await save();
    await waitFor(() => expect(saveMenuItems).toHaveBeenCalled());
    expect(commitPendingImages).toHaveBeenCalledWith([PREVIEW, SAVED, null]);
    const saved = saveMenuItems.mock.calls[0]?.[1] as MenuItemFormInput[];
    expect(saved.map((it) => it.image_url)).toEqual([UPLOADED, SAVED, null]);
    expect(removeUnsavedImages).not.toHaveBeenCalled();
  });

  it("deletes the photos it uploaded when the menu save fails", async () => {
    saveMenuItems.mockResolvedValue({
      success: false,
      error: "Could not save menu",
    });
    await save();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not save menu"),
    );
    expect(removeUnsavedImages).toHaveBeenCalledWith([UPLOADED]);
  });

  it("stops the save and deletes what did upload when an upload fails", async () => {
    commitPendingImages.mockRejectedValue(
      new PendingImageUploadError([UPLOADED], new Error("denied")),
    );
    await save();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(saveMenuItems).not.toHaveBeenCalled();
    expect(removeUnsavedImages).toHaveBeenCalledWith([UPLOADED]);
  });
});
