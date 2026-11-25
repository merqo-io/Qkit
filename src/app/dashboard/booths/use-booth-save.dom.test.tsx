// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  NAVIGATION_TIMEOUT_MS,
  useBoothSave,
  type BoothFormValues,
} from "./use-booth-save";

const { saveBooth, toastError } = vi.hoisted(() => ({
  saveBooth: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("./actions", () => ({ saveBooth, deleteBooth: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));
vi.mock("@/lib/image-upload-adapter", () => ({
  removeUnsavedImages: vi.fn(),
}));

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

const VALUES: BoothFormValues = {
  name: "Kopi Cart",
  imageUrl: null,
  isActive: true,
  hours: null,
  takesPayment: false,
  socialLinks: null,
  requiresArrivalConfirm: false,
  walkupDefault: false,
  printEnabled: false,
  pickupScanEnabled: false,
  paykitBookingId: null,
  dailyCupCap: "",
  maxItemsPerOrder: "",
};

const assign = vi.fn();
const submit = { preventDefault: vi.fn() } as unknown as React.FormEvent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  saveBooth.mockResolvedValue({ success: true, boothId: "b1" });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign },
  });
});
afterEach(() => vi.useRealTimers());

describe("useBoothSave navigation", () => {
  it("hard-navigates to the menu when the client navigation stalls", async () => {
    const { result } = renderHook(() => useBoothSave(undefined, VALUES));
    await act(async () => {
      void result.current.onSubmit(submit);
      await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1);
    });
    expect(routerReplace).toHaveBeenCalledWith(
      "/dashboard/booths/b1/menu?new=1",
    );
    expect(assign).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(toastError).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/dashboard/booths/b1/menu?new=1");
    expect(result.current.saving).toBe(true);
  });

  it("does not hard-navigate when the form unmounts before the deadline", async () => {
    const { result, unmount } = renderHook(() =>
      useBoothSave(undefined, VALUES),
    );
    await act(async () => {
      void result.current.onSubmit(submit);
      await vi.advanceTimersByTimeAsync(100);
    });
    unmount();
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS * 2);
    expect(toastError).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("edit saves fall back to the booth list", async () => {
    const { result } = renderHook(() =>
      useBoothSave("00000000-0000-4000-8000-000000000009", VALUES),
    );
    await act(async () => {
      void result.current.onSubmit(submit);
      await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS + 1);
    });
    expect(routerReplace).toHaveBeenCalledWith("/dashboard/booths");
    expect(assign).toHaveBeenCalledWith("/dashboard/booths");
  });
});
