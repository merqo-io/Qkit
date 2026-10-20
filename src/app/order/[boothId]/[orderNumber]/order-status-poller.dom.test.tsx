// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderStatusPoller } from "./order-status-poller";
import type { OrderStatus } from "@/lib/types";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { getOrderStatus, getWaitEstimate, confirmArrival, alerts } = vi.hoisted(
  () => ({
    getOrderStatus: vi.fn(),
    getWaitEstimate: vi.fn(),
    confirmArrival: vi.fn(),
    alerts: {
      isNotifySupported: vi.fn(() => true),
      notifyPermission: vi.fn((): NotificationPermission | null => "default"),
      requestNotifyPermission: vi.fn(
        async () => "granted" as NotificationPermission,
      ),
      fireReadyNotification: vi.fn(async () => undefined),
      playReadyChime: vi.fn(async () => true),
      unlockAudio: vi.fn(),
    },
  }),
);

vi.mock("./status-actions", () => ({
  getOrderStatus,
  getWaitEstimate,
  confirmArrival,
}));
vi.mock("@/lib/order-alerts", () => alerts);

const { subscribeToPush, savePushSubscription } = vi.hoisted(() => ({
  subscribeToPush: vi.fn(),
  savePushSubscription: vi.fn(),
}));
vi.mock("@/lib/push/client", () => ({ subscribeToPush }));
vi.mock("./push-actions", () => ({ savePushSubscription }));
const PUSH_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "p", auth: "a" },
};

function renderPoller(
  initialStatus: OrderStatus = "preparing",
  awaitingPayment = false,
  requiresArrivalConfirm = true,
  paymentSent = awaitingPayment,
) {
  return render(
    <OrderStatusPoller
      boothId="b1"
      orderNumber="0007"
      // Different from orderNumber on purpose, to prove copy uses displayNumber.
      displayNumber="7"
      token="tok"
      initialStatus={initialStatus}
      boothName="Kopi Cart"
      placedAt="2026-07-04T00:00:00Z"
      awaitingPayment={awaitingPayment}
      paymentSent={paymentSent}
      requiresArrivalConfirm={requiresArrivalConfirm}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  alerts.isNotifySupported.mockReturnValue(true);
  alerts.notifyPermission.mockReturnValue("default");
  getWaitEstimate.mockResolvedValue({ seconds: null, ordersAhead: 0 });
  confirmArrival.mockResolvedValue({ success: true });
  subscribeToPush.mockResolvedValue(PUSH_SUB);
  savePushSubscription.mockResolvedValue({ success: true });
});

describe("OrderStatusPoller", () => {
  it("polls on mount and reflects a status change", async () => {
    getOrderStatus.mockResolvedValue("ready");
    renderPoller("preparing");

    await waitFor(() =>
      expect(screen.getByText("It's ready")).toBeInTheDocument(),
    );
    expect(getOrderStatus).toHaveBeenCalledWith("b1", "0007", "tok");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Come to the counter to collect it."),
    ).toBeInTheDocument();
  });

  it("alerts the customer when the order becomes ready", async () => {
    getOrderStatus.mockResolvedValue("ready");
    renderPoller("preparing");

    await waitFor(() =>
      expect(alerts.fireReadyNotification).toHaveBeenCalledWith(
        "Kopi Cart",
        "7",
        expect.any(String),
      ),
    );
    // Tab is visible in jsdom, so it chimes immediately.
    expect(alerts.playReadyChime).toHaveBeenCalled();
  });

  it("shows a 'placed' time stamp once mounted", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    renderPoller("preparing");
    await waitFor(() =>
      expect(screen.getByText(/^Placed /)).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves the placed time to the header on a completed order", async () => {
    getOrderStatus.mockResolvedValue("completed");
    renderPoller("completed");
    await waitFor(() =>
      expect(screen.getByText("Collected. Enjoy!")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Placed /)).not.toBeInTheDocument();
  });

  it("hides the placed stamp for a cancelled order", async () => {
    getOrderStatus.mockResolvedValue("cancelled");
    renderPoller("cancelled");
    // Let the mount clock effect run.
    await waitFor(() =>
      expect(screen.getByText("This order was cancelled")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Placed /)).not.toBeInTheDocument();
    // A cancelled order has no place on the track, so none is drawn.
    expect(
      screen.queryByRole("list", { name: "Order progress" }),
    ).not.toBeInTheDocument();
  });

  it("does not poll once the order is in a terminal state", async () => {
    getOrderStatus.mockResolvedValue("completed");
    renderPoller("completed");

    // Give any stray microtasks a chance to run.
    await Promise.resolve();
    expect(getOrderStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Collected. Enjoy!")).toBeInTheDocument();
  });

  it("shows all four stages from the start, with the current one marked", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    renderPoller("preparing");

    const track = screen.getByRole("list", { name: "Order progress" });
    const stages = Array.from(track.querySelectorAll("li"));
    // The finish is in sight for the whole wait, not revealed stage by stage.
    expect(stages.map((li) => li.textContent)).toEqual([
      "Received",
      "Preparing",
      "Ready",
      "Collected",
    ]);
    expect(stages.map((li) => li.getAttribute("aria-current"))).toEqual([
      null,
      "step",
      null,
      null,
    ]);
  });

  it("keeps Ready and Collected as separate stages", async () => {
    getOrderStatus.mockResolvedValue("completed");
    renderPoller("completed");
    const track = screen.getByRole("list", { name: "Order progress" });
    const current = track.querySelector('li[aria-current="step"]');
    // A collected order must not look like one still waiting on the shelf.
    expect(current?.textContent).toBe("Collected");
  });

  it("offers the alert opt-in, unlocks audio + requests permission on click", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    const user = userEvent.setup();
    renderPoller("preparing");

    const btn = await screen.findByRole("button", {
      name: /Alert me when it's ready/,
    });
    await user.click(btn);

    expect(alerts.unlockAudio).toHaveBeenCalled();
    expect(alerts.requestNotifyPermission).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByText(/We'll alert you the moment it's ready/),
      ).toBeInTheDocument(),
    );
  });

  it("shows a range-based wait estimate once one is available", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    getWaitEstimate.mockResolvedValue({ seconds: 300, ordersAhead: 2 });
    renderPoller("preparing");

    await waitFor(() =>
      expect(screen.getByText("4-6 min")).toBeInTheDocument(),
    );
  });

  it("falls back to a queue-position label when there isn't enough history for a time estimate", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    getWaitEstimate.mockResolvedValue({ seconds: null, ordersAhead: 2 });
    renderPoller("preparing");

    await waitFor(() =>
      expect(screen.getByText("2 orders ahead of you")).toBeInTheDocument(),
    );
  });

  it("does not show a wait estimate once the order is ready", async () => {
    getOrderStatus.mockResolvedValue("ready");
    getWaitEstimate.mockResolvedValue({ seconds: 300, ordersAhead: 2 });
    renderPoller("preparing");

    await waitFor(() =>
      expect(screen.getByText("It's ready")).toBeInTheDocument(),
    );
    expect(screen.queryByText("4-6 min")).not.toBeInTheDocument();
  });

  it("still arms (sound-only) where notifications are unsupported", async () => {
    // iOS Safari tab: no Notification API.
    alerts.isNotifySupported.mockReturnValue(false);
    alerts.notifyPermission.mockReturnValue(null);
    getOrderStatus.mockResolvedValue("preparing");
    const user = userEvent.setup();
    renderPoller("preparing");

    const btn = await screen.findByRole("button", {
      name: /Alert me when it's ready/,
    });
    await user.click(btn);

    expect(alerts.unlockAudio).toHaveBeenCalled();
    expect(alerts.requestNotifyPermission).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText(/keep this tab open/)).toBeInTheDocument(),
    );
  });
});

describe("OrderStatusPoller — payment sent, stall still checking it", () => {
  it("says the stall is checking the payment, and never asks to pay again", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    renderPoller("preparing", true);

    await waitFor(() =>
      expect(
        screen.getByText(
          "The stall is still checking your payment. Stay close.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/complete your payment/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/turns to Ready the moment it is/),
    ).not.toBeInTheDocument();
  });

  it("sends a ready order to the counter, where the payment gets checked", async () => {
    getOrderStatus.mockResolvedValue("ready");
    renderPoller("preparing", true);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Come to the counter. The stall will check your payment there.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/pay before you collect/i),
    ).not.toBeInTheDocument();
  });

  it("tells a customer who paid for a cancelled order how to get a refund", async () => {
    getOrderStatus.mockResolvedValue("cancelled");
    renderPoller("cancelled", false, true, true);

    await waitFor(() =>
      expect(
        screen.getByText(
          "If you already paid, show this page to the stall for a refund.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("says nothing about refunds when a cancelled order was never paid", async () => {
    getOrderStatus.mockResolvedValue("cancelled");
    renderPoller("cancelled", false, true, false);

    await waitFor(() =>
      expect(
        screen.getByText("The stall will not be making it."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/refund/i)).not.toBeInTheDocument();
  });

  it("shows the normal messages once payment is no longer outstanding", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    renderPoller("preparing", false);

    await waitFor(() =>
      expect(screen.getByText("We're making it now")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/turns to Ready the moment it is/),
    ).toBeInTheDocument();
  });
});

describe("OrderStatusPoller — arrival confirmation", () => {
  it("asks for the arrival tap, with no wait estimate, while pending", async () => {
    getOrderStatus.mockResolvedValue("pending");
    getWaitEstimate.mockResolvedValue({ seconds: 300, ordersAhead: 2 });
    renderPoller("pending");
    expect(
      await screen.findByRole("button", { name: /i'm here/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tap when you're at the counter"),
    ).toBeInTheDocument();
    // Nothing is being made yet, so there is no wait to estimate.
    expect(screen.queryByText("About")).not.toBeInTheDocument();
  });

  it("calls confirmArrival and shows the progress view on success", async () => {
    getOrderStatus.mockResolvedValue("pending");
    renderPoller("pending");
    const user = userEvent.setup();
    const btn = await screen.findByRole("button", { name: /i'm here/i });
    getOrderStatus.mockResolvedValue("preparing");
    await user.click(btn);
    expect(confirmArrival).toHaveBeenCalledWith("b1", "0007", "tok");
    await waitFor(() =>
      expect(screen.getByText("We're making it now")).toBeInTheDocument(),
    );
  });

  it("stays on the arrival prompt when confirmArrival is rejected", async () => {
    getOrderStatus.mockResolvedValue("pending");
    confirmArrival.mockResolvedValueOnce({
      success: false,
      error: "Could not start your order. Try again.",
    });
    renderPoller("pending");
    const user = userEvent.setup();
    const btn = await screen.findByRole("button", { name: /i'm here/i });
    await user.click(btn);

    await waitFor(() => expect(confirmArrival).toHaveBeenCalled());
    expect(
      screen.getByRole("button", { name: /i'm here/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("We're making it now")).not.toBeInTheDocument();
  });
});

describe("OrderStatusPoller — vendor-accept gate (no printer, no arrival confirm)", () => {
  it("shows no self-start button, and never calls confirmArrival", async () => {
    getOrderStatus.mockResolvedValue("pending");
    renderPoller("pending", false, false);
    expect(await screen.findByText("We've got your order")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /i'm here/i }),
    ).not.toBeInTheDocument();
    expect(confirmArrival).not.toHaveBeenCalled();
  });
});

describe("OrderStatusPoller: lost connection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says so after two checks in a row fail, and stops once one succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getOrderStatus.mockRejectedValue(new Error("offline"));
    renderPoller("preparing");

    await vi.advanceTimersByTimeAsync(100);
    expect(screen.queryByText(/no connection/i)).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5100);
    expect(await screen.findByText(/no connection/i)).toBeInTheDocument();

    getOrderStatus.mockResolvedValue("preparing");
    await vi.advanceTimersByTimeAsync(5100);
    await waitFor(() =>
      expect(screen.queryByText(/no connection/i)).not.toBeInTheDocument(),
    );
  });

  it("treats a check the server could not answer as a miss too", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getOrderStatus.mockResolvedValue(null);
    renderPoller("preparing");

    await vi.advanceTimersByTimeAsync(5200);
    expect(await screen.findByText(/no connection/i)).toBeInTheDocument();
  });
});

describe("OrderStatusPoller: web push", () => {
  it("subscribes and saves push after the customer allows notifications", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    const user = userEvent.setup();
    renderPoller("preparing");

    await user.click(
      await screen.findByRole("button", { name: /Alert me when it's ready/ }),
    );

    await waitFor(() =>
      expect(savePushSubscription).toHaveBeenCalledWith(
        "b1",
        "0007",
        "tok",
        PUSH_SUB,
      ),
    );
  });

  it("does not subscribe when the customer declines notifications", async () => {
    getOrderStatus.mockResolvedValue("preparing");
    alerts.requestNotifyPermission.mockResolvedValueOnce("denied");
    const user = userEvent.setup();
    renderPoller("preparing");

    await user.click(
      await screen.findByRole("button", { name: /Alert me when it's ready/ }),
    );

    await waitFor(() => expect(alerts.playReadyChime).toHaveBeenCalled());
    expect(subscribeToPush).not.toHaveBeenCalled();
    expect(savePushSubscription).not.toHaveBeenCalled();
  });

  it("subscribes on load when permission was granted on an earlier visit", async () => {
    alerts.notifyPermission.mockReturnValue("granted");
    getOrderStatus.mockResolvedValue("preparing");
    renderPoller("preparing");

    await waitFor(() =>
      expect(savePushSubscription).toHaveBeenCalledWith(
        "b1",
        "0007",
        "tok",
        PUSH_SUB,
      ),
    );
  });

  it("does not subscribe on load once the order is ready", async () => {
    alerts.notifyPermission.mockReturnValue("granted");
    getOrderStatus.mockResolvedValue("ready");
    renderPoller("ready");

    await screen.findByText("It's ready");
    expect(subscribeToPush).not.toHaveBeenCalled();
  });

  it("saves nothing where push is unavailable, and the opt-in still arms", async () => {
    subscribeToPush.mockResolvedValue(null);
    getOrderStatus.mockResolvedValue("preparing");
    const user = userEvent.setup();
    renderPoller("preparing");

    await user.click(
      await screen.findByRole("button", { name: /Alert me when it's ready/ }),
    );

    expect(
      await screen.findByText(/We'll alert you the moment it's ready/),
    ).toBeInTheDocument();
    expect(subscribeToPush).toHaveBeenCalled();
    expect(savePushSubscription).not.toHaveBeenCalled();
  });

  it("keeps the opt-in working when saving the subscription fails", async () => {
    savePushSubscription.mockRejectedValue(new Error("offline"));
    getOrderStatus.mockResolvedValue("preparing");
    const user = userEvent.setup();
    renderPoller("preparing");

    await user.click(
      await screen.findByRole("button", { name: /Alert me when it's ready/ }),
    );

    expect(
      await screen.findByText(/We'll alert you the moment it's ready/),
    ).toBeInTheDocument();
  });
});
