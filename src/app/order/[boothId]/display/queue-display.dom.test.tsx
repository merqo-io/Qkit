// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueueDisplay } from "./queue-display";
import type { QueueDisplayOrder } from "./actions";

const { getBoothQueueDisplay, alerts } = vi.hoisted(() => ({
  getBoothQueueDisplay: vi.fn(),
  alerts: {
    playReadyChime: vi.fn(async () => true),
    unlockAudio: vi.fn(),
  },
}));

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return { ...actual, getBoothQueueDisplay };
});
vi.mock("@/lib/order-alerts", () => alerts);

// A tile emphasizes the number's trailing digit in its own <span> (see
// splitTrailingDigit), so its text is split across elements — a plain
// string getByText can't match that (TRL's own hint: use a function
// matcher). Scoped to the tile's own size class so its (identical-text,
// single-tile) wrapping flex container isn't also a match.
function byOrderNumber(number: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === number;
}
const PREPARING_TILE_OPTS = { selector: '[class*="size-24"]' };
const READY_TILE_OPTS = { selector: '[class*="size-32"]' };

function renderDisplay(initialOrders: QueueDisplayOrder[]) {
  return render(
    <QueueDisplay
      boothId="b1"
      boothName="Kopi Cart"
      initialOrders={initialOrders}
      code="abc123"
    />,
  );
}

const PREPARING: QueueDisplayOrder = {
  orderNumber: "0001",
  displayNumber: "001",
  status: "preparing",
};
const READY: QueueDisplayOrder = {
  orderNumber: "0002",
  displayNumber: "002",
  status: "ready",
};

beforeEach(() => {
  vi.clearAllMocks();
  getBoothQueueDisplay.mockResolvedValue([]);
});

describe("QueueDisplay", () => {
  it("shows the Order here headline, prompt line and the QR", () => {
    renderDisplay([PREPARING]);

    expect(screen.getByText("Order here")).toBeInTheDocument();
    expect(
      screen.getByText(/Scan, order and pay by PayNow/),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Ordering QR code")).toBeInTheDocument();
    expect(screen.getByText("Preparing")).toBeInTheDocument();
    expect(screen.getByText("Ready for pickup")).toBeInTheDocument();
  });

  describe("QR toggle", () => {
    const KEY = "qkit.display.qrHidden.b1";

    beforeEach(() => {
      window.localStorage.clear();
    });

    it("shows the QR by default with a Hide QR code control", () => {
      renderDisplay([PREPARING]);

      const toggle = screen.getByRole("button", { name: "Hide QR code" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTitle("Ordering QR code")).toBeInTheDocument();
    });

    it("hides the QR block, remembers it, and shows it again", async () => {
      const user = userEvent.setup();
      renderDisplay([PREPARING]);

      await user.click(screen.getByRole("button", { name: "Hide QR code" }));

      expect(screen.queryByText("Order here")).toBeNull();
      expect(screen.queryByTitle("Ordering QR code")).toBeNull();
      expect(window.localStorage.getItem(KEY)).toBe("1");
      const toggle = screen.getByRole("button", { name: "Show QR code" });
      expect(toggle).toHaveAttribute("aria-pressed", "true");

      await user.click(toggle);

      expect(screen.getByText("Order here")).toBeInTheDocument();
      expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it("restores a stored hidden state after mount", async () => {
      window.localStorage.setItem(KEY, "1");
      renderDisplay([PREPARING]);

      await waitFor(() =>
        expect(screen.queryByTitle("Ordering QR code")).toBeNull(),
      );
      expect(
        screen.getByRole("button", { name: "Show QR code" }),
      ).toBeInTheDocument();
    });

    it("does not crash when storage throws", async () => {
      const user = userEvent.setup();
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("denied");
      });
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("denied");
      });
      try {
        renderDisplay([PREPARING]);
        expect(screen.getByTitle("Ordering QR code")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Hide QR code" }));
        expect(screen.queryByTitle("Ordering QR code")).toBeNull();
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  it("tells customers to check their phone in the Ready column", () => {
    renderDisplay([PREPARING]);
    const ready = screen.getByText("Ready for pickup").closest("section")!;
    expect(
      within(ready).getByText(
        "See your number? Check your phone, then collect.",
      ),
    ).toBeInTheDocument();
  });

  it("groups orders into Preparing and Ready for pickup", () => {
    renderDisplay([PREPARING, READY]);

    const preparing = screen.getByText("Preparing").closest("section")!;
    const ready = screen.getByText("Ready for pickup").closest("section")!;
    expect(preparing).toHaveTextContent("001");
    expect(ready).toHaveTextContent("002");
  });

  it("shows an empty-state line for each group with nothing in it", () => {
    renderDisplay([]);

    expect(screen.queryByText("No orders in progress")).toBeNull();
    expect(screen.getByText("Nothing ready yet")).toBeInTheDocument();
    expect(screen.getByText("Orders will appear here")).toBeInTheDocument();
  });

  it("keeps the Preparing empty line when only Preparing is empty", () => {
    renderDisplay([READY]);

    expect(screen.getByText("No orders in progress")).toBeInTheDocument();
  });

  it("drops the big empty headline once any order exists", () => {
    renderDisplay([READY]);

    expect(screen.queryByText("Orders will appear here")).toBeNull();
    expect(screen.getByText("No orders in progress")).toBeInTheDocument();
  });

  it("hides vendor controls after idle and shows them again on interaction", () => {
    vi.useFakeTimers();
    try {
      renderDisplay([]);
      const wrapper = () =>
        screen.getByRole("button", { name: /enable sound/i }).parentElement!;

      expect(wrapper()).toHaveAttribute("data-controls-visible", "true");
      act(() => {
        vi.advanceTimersByTime(5100);
      });
      expect(wrapper()).toHaveAttribute("data-controls-visible", "false");

      act(() => {
        window.dispatchEvent(new Event("mousemove"));
      });
      expect(wrapper()).toHaveAttribute("data-controls-visible", "true");

      act(() => {
        vi.advanceTimersByTime(5100);
      });
      expect(wrapper()).toHaveAttribute("data-controls-visible", "false");
      act(() => {
        window.dispatchEvent(new Event("focusin"));
      });
      expect(wrapper()).toHaveAttribute("data-controls-visible", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("polls on mount and reflects updated order data", async () => {
    getBoothQueueDisplay.mockResolvedValue([
      { ...PREPARING, displayNumber: "001" },
    ]);
    renderDisplay([]);

    await waitFor(() =>
      expect(getBoothQueueDisplay).toHaveBeenCalledWith("b1"),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Preparing").closest("section"),
      ).toHaveTextContent("001"),
    );
  });

  it("stamps a tile the moment it transitions to ready, silently by default", async () => {
    getBoothQueueDisplay.mockResolvedValue([{ ...PREPARING, status: "ready" }]);
    renderDisplay([PREPARING]);

    await waitFor(() => {
      const tile = screen.getByText(byOrderNumber("001"), READY_TILE_OPTS);
      expect(tile).toHaveClass("fade-rise");
      expect(tile).toHaveClass("bg-primary"); // fresh: solid fill
    });
    expect(alerts.playReadyChime).not.toHaveBeenCalled();
  });

  it("renders an order already ready before the page loaded as aged, not fresh", async () => {
    getBoothQueueDisplay.mockResolvedValue([READY]);
    renderDisplay([READY]);

    await waitFor(() => expect(getBoothQueueDisplay).toHaveBeenCalled());
    const tile = screen.getByText(byOrderNumber("002"), READY_TILE_OPTS);
    expect(tile).not.toHaveClass("fade-rise");
    expect(tile).toHaveClass("bg-primary/10"); // aged: muted tint, not solid
  });

  it("unlocks audio and hides its own button once sound is enabled", async () => {
    const user = userEvent.setup();
    renderDisplay([]);

    await user.click(screen.getByRole("button", { name: /Enable sound/ }));

    expect(alerts.unlockAudio).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Enable sound/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps showing the last good state on a transient poll failure", async () => {
    getBoothQueueDisplay.mockResolvedValue(null);
    renderDisplay([PREPARING]);

    await waitFor(() => expect(getBoothQueueDisplay).toHaveBeenCalled());
    expect(
      screen.getByText(byOrderNumber("001"), PREPARING_TILE_OPTS),
    ).toBeInTheDocument();
  });

  it("caps how many preparing tiles it renders, no scrolling on a TV screen", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      orderNumber: String(i + 1).padStart(4, "0"),
      displayNumber: String(i + 1).padStart(3, "0"),
      status: "preparing" as const,
    }));
    renderDisplay(many);

    const section = screen.getByText("Preparing").closest("section")!;
    expect(section.querySelectorAll('[class*="size-24"]')).toHaveLength(12);
    expect(section).toHaveTextContent("+3 more preparing");
  });

  it("caps how many ready tiles it renders", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      orderNumber: String(i + 1).padStart(4, "0"),
      displayNumber: String(i + 1).padStart(3, "0"),
      status: "ready" as const,
    }));
    renderDisplay(many);

    const section = screen.getByText("Ready for pickup").closest("section")!;
    expect(section.querySelectorAll('[class*="size-32"]')).toHaveLength(8);
    expect(section).toHaveTextContent("+2 more ready");
  });

  it("keeps ready tiles in the order the server sends, a fresh one is not pulled forward", async () => {
    // The server already sorts the Ready group most-recently-readied first;
    // freshness is a visual cue only, so a tile never jumps to the front and
    // later drops back.
    const aged: QueueDisplayOrder = {
      orderNumber: "0009",
      displayNumber: "009",
      status: "ready",
    };
    getBoothQueueDisplay.mockResolvedValue([
      aged,
      { ...PREPARING, status: "ready" },
    ]);
    renderDisplay([aged, PREPARING]);

    const section = screen.getByText("Ready for pickup").closest("section")!;
    await waitFor(() =>
      expect(
        within(section).getByText(byOrderNumber("001"), READY_TILE_OPTS),
      ).toHaveClass("bg-primary"),
    );
    const tiles = [...section.querySelectorAll('[class*="size-32"]')].map(
      (t) => t.textContent,
    );
    expect(tiles).toEqual(["009", "001"]);
  });

  it("caps the ready column from the front of the server order and counts the rest", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      orderNumber: String(i + 1).padStart(4, "0"),
      displayNumber: String(i + 1).padStart(3, "0"),
      status: "ready" as const,
    }));
    renderDisplay(many);

    const section = screen.getByText("Ready for pickup").closest("section")!;
    const tiles = [...section.querySelectorAll('[class*="size-32"]')].map(
      (t) => t.textContent,
    );
    expect(tiles).toEqual([
      "001",
      "002",
      "003",
      "004",
      "005",
      "006",
      "007",
      "008",
    ]);
    expect(section).toHaveTextContent("+3 more ready");
  });
});
