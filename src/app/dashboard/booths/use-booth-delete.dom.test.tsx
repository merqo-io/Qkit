// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBoothDelete } from "./use-booth-save";

const { deleteBooth } = vi.hoisted(() => ({ deleteBooth: vi.fn() }));
vi.mock("./actions", () => ({
  deleteBooth,
  saveBooth: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  deleteBooth.mockReset();
});

describe("useBoothDelete", () => {
  it("rethrows the server's message for a failed result", async () => {
    deleteBooth.mockResolvedValue({ success: false, error: "Booth is in use" });
    const { result } = renderHook(() => useBoothDelete("b1"));
    await expect(result.current.onDelete()).rejects.toThrow("Booth is in use");
  });

  it("replaces a thrown network error with a message a vendor can act on", async () => {
    deleteBooth.mockImplementation(async () => {
      throw new Error("Failed to fetch");
    });
    const { result } = renderHook(() => useBoothDelete("b1"));
    const outcome = await result.current.onDelete()!.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    expect(outcome).toBe(
      "Could not delete the booth. Refresh to check its status before retrying.",
    );
  });
});
