// @vitest-environment jsdom
//
// PickupScanner has its own dedicated test file, so it's stubbed here to
// keep this test focused on page.tsx's own boothId validation/notFound
// gating (same pattern as ../display/page.dom.test.tsx).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PickupPage from "./page";

const { notFoundMock } = vi.hoisted(() => ({
  // Real notFound() throws to abort rendering — mirror that so a test
  // hitting the notFound branch doesn't fall through into the rest of the
  // function body, same as it never would in production.
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("./pickup-scanner", () => ({
  PickupScanner: ({ boothId }: { boothId: string }) => (
    <input aria-label="Scan input" data-booth-id={boothId} />
  ),
}));

const { boothMaybeSingle } = vi.hoisted(() => ({ boothMaybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () =>
    Promise.resolve({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: boothMaybeSingle }) }),
      }),
    }),
}));

const VALID_BOOTH_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  boothMaybeSingle.mockReset().mockResolvedValue({
    data: { pickup_scan_enabled: true },
  });
  notFoundMock.mockReset().mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("PickupPage", () => {
  it("calls notFound for an invalid booth id", async () => {
    await expect(
      PickupPage({ params: Promise.resolve({ boothId: "not-a-uuid" }) }),
    ).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders PickupScanner with the booth id when valid", async () => {
    render(
      await PickupPage({
        params: Promise.resolve({ boothId: VALID_BOOTH_ID }),
      }),
    );
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "data-booth-id",
      VALID_BOOTH_ID,
    );
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it.each([
    ["switched off", { data: { pickup_scan_enabled: false } }],
    ["unknown", { data: null }],
  ])("shows the off message for a booth that is %s", async (_label, row) => {
    boothMaybeSingle.mockResolvedValue(row);
    render(
      await PickupPage({
        params: Promise.resolve({ boothId: VALID_BOOTH_ID }),
      }),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Self-checkout pickup is off for this booth/),
    ).toBeInTheDocument();
  });
});
