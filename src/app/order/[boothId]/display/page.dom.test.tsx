// @vitest-environment jsdom
//
// Follows the pattern established in ../[orderNumber]/page.dom.test.tsx:
// page.tsx is a plain async function with no RSC-specific machinery, so it
// can be awaited directly and its returned element tree rendered like any
// other component. QueueDisplay has its own dedicated test file, so it's
// stubbed here to keep this test focused on page.tsx's own booth
// resolution/notFound gating.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import BoothQueueDisplayPage from "./page";

const {
  notFoundMock,
  createServiceClientMock,
  fromMock,
  getBoothQueueDisplay,
  counterOpsMock,
} = vi.hoisted(() => ({
  // Real notFound() throws to abort rendering — mirror that so a test
  // hitting the notFound branch doesn't fall through into the rest of
  // the function body, same as it never would in production.
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  createServiceClientMock: vi.fn(),
  fromMock: vi.fn(),
  getBoothQueueDisplay: vi.fn(),
  counterOpsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/counter-ops", () => ({ vendorHasCounterOps: counterOpsMock }));
vi.mock("./actions", () => ({ getBoothQueueDisplay }));
vi.mock("./queue-display", () => ({
  QueueDisplay: ({
    boothId,
    boothName,
    initialOrders,
  }: {
    boothId: string;
    boothName: string;
    initialOrders: unknown[];
  }) => (
    <div data-testid="queue-display">
      {boothId} · {boothName} · {initialOrders.length}
    </div>
  ),
}));

const BOOTH_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  notFoundMock.mockReset();
  fromMock.mockReset();
  createServiceClientMock.mockReset().mockResolvedValue({ from: fromMock });
  getBoothQueueDisplay.mockReset().mockResolvedValue([]);
  counterOpsMock.mockReset().mockResolvedValue(true);
});

function boothChain(data: { name: string; vendor_id: string } | null) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data, error: null }),
      }),
    }),
  };
}

describe("BoothQueueDisplayPage", () => {
  it("hard-blocks a non-uuid boothId without reading the booth", async () => {
    await expect(
      BoothQueueDisplayPage({
        params: Promise.resolve({ boothId: "not-a-uuid" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("blocks when the booth doesn't exist", async () => {
    fromMock.mockReturnValue(boothChain(null));
    await expect(
      BoothQueueDisplayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the queue display for a real booth", async () => {
    fromMock.mockReturnValue(
      boothChain({ name: "Kopi Cart", vendor_id: "v1" }),
    );
    getBoothQueueDisplay.mockResolvedValue([
      { orderNumber: "1", displayNumber: "001", status: "ready" },
    ]);

    const el = await BoothQueueDisplayPage({
      params: Promise.resolve({ boothId: BOOTH_ID }),
    });
    render(el);

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(getBoothQueueDisplay).toHaveBeenCalledWith(BOOTH_ID);
    expect(screen.getByTestId("queue-display")).toHaveTextContent(
      `${BOOTH_ID} · Kopi Cart · 1`,
    );
  });

  it("shows a plain notice, with no queue read, when the plan has no counter ops", async () => {
    fromMock.mockReturnValue(
      boothChain({ name: "Kopi Cart", vendor_id: "v1" }),
    );
    counterOpsMock.mockResolvedValue(false);

    render(
      await BoothQueueDisplayPage({
        params: Promise.resolve({ boothId: BOOTH_ID }),
      }),
    );

    expect(screen.queryByTestId("queue-display")).not.toBeInTheDocument();
    expect(getBoothQueueDisplay).not.toHaveBeenCalled();
    expect(screen.getByText(/not available/)).toBeInTheDocument();
  });

  it("degrades to an empty order list when the read fails", async () => {
    fromMock.mockReturnValue(
      boothChain({ name: "Kopi Cart", vendor_id: "v1" }),
    );
    getBoothQueueDisplay.mockResolvedValue(null);

    const el = await BoothQueueDisplayPage({
      params: Promise.resolve({ boothId: BOOTH_ID }),
    });
    render(el);

    expect(screen.getByTestId("queue-display")).toHaveTextContent(
      `${BOOTH_ID} · Kopi Cart · 0`,
    );
  });
});
