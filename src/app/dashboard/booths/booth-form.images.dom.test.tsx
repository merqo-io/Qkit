// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Entitlement } from "@/lib/plan";

const {
  saveBooth,
  deleteBooth,
  commitPendingImages,
  removeUnsavedImages,
  toastError,
} = vi.hoisted(() => ({
  saveBooth: vi.fn(),
  deleteBooth: vi.fn(),
  commitPendingImages: vi.fn(),
  removeUnsavedImages: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("./actions", () => ({ saveBooth, deleteBooth }));
vi.mock("./working-hours-editor", () => ({ WorkingHoursEditor: () => null }));
vi.mock("./payment-section", () => ({ PaymentSection: () => null }));
vi.mock("./social-links-section", () => ({ SocialLinksSection: () => null }));
vi.mock("./close-booth-control", () => ({ CloseBoothControl: () => null }));
vi.mock("@/lib/image-upload-adapter", () => ({
  uploadQkitImage: vi.fn(),
  removeUnsavedImages,
}));
vi.mock("@merqo/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@merqo/ui")>();
  return {
    ...actual,
    commitPendingImages,
    // Stands in for picking a banner in deferred mode: onChange receives the
    // local preview URL, and nothing is uploaded.
    ImageUploader: ({ onChange }: { onChange: (url: string) => void }) => (
      <button type="button" onClick={() => onChange(PREVIEW)}>
        pick banner
      </button>
    ),
  };
});
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { PendingImageUploadError } from "@merqo/ui";
import { BoothForm } from "./booth-form";

const PREVIEW = "blob:http://localhost/preview";
const UPLOADED =
  "https://abc.supabase.co/storage/v1/object/public/booth-images/v1/banner.webp";

const ENTITLEMENT: Entitlement = {
  tier: "free",
  maxBooths: 1,
  maxMenuItems: 6,
  maxOptionGroupsPerItem: 3,
  autoCloseHours: false,
  stockCaps: false,
  statsRanges: ["24h"],
};

const NO_SETUP = { state: "none" } as const;

function renderForm() {
  return render(
    <BoothForm
      vendorId="v1"
      entitlement={ENTITLEMENT}
      vendorSocialLinks={{}}
      paymentSetup={NO_SETUP}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  saveBooth.mockResolvedValue({ success: true, boothId: "b1" });
  commitPendingImages.mockImplementation(async (values: unknown[]) => ({
    urls: values.map((v) => (v === PREVIEW ? UPLOADED : v)),
    uploaded: values.includes(PREVIEW) ? [UPLOADED] : [],
  }));
});

// The banner uploader defers its upload, so the only moment an image reaches
// storage is here, on Save.
describe("BoothForm deferred banner upload", () => {
  it("uploads the picked banner on save and saves its public URL", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: "pick banner" }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    await waitFor(() => expect(saveBooth).toHaveBeenCalled());
    expect(commitPendingImages).toHaveBeenCalledWith([PREVIEW]);
    expect(saveBooth).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: UPLOADED }),
      [UPLOADED],
    );
    expect(removeUnsavedImages).not.toHaveBeenCalled();
  });

  it("stops the save and deletes what did upload when an upload fails", async () => {
    commitPendingImages.mockRejectedValue(
      new PendingImageUploadError([UPLOADED], new Error("denied")),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: "pick banner" }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(saveBooth).not.toHaveBeenCalled();
    expect(removeUnsavedImages).toHaveBeenCalledWith([UPLOADED]);
  });

  it("deletes the fresh upload when the form fails validation", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "pick banner" }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(saveBooth).not.toHaveBeenCalled();
    expect(removeUnsavedImages).toHaveBeenCalledWith([UPLOADED]);
  });

  it("leaves cleanup to saveBooth when the save itself fails", async () => {
    saveBooth.mockResolvedValue({ success: false, error: "Could not save" });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Booth name"), "Ice Cream Cart");
    await user.click(screen.getByRole("button", { name: "pick banner" }));
    await user.click(screen.getByRole("button", { name: /save booth/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not save"),
    );
    expect(removeUnsavedImages).not.toHaveBeenCalled();
  });
});
