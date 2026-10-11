// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { toast } from "sonner";
import userEvent from "@testing-library/user-event";

const updateBoardSettings = vi.fn();
vi.mock("./actions", () => ({
  updateBoardSettings: (...args: unknown[]) => updateBoardSettings(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const playSound = vi.fn(async (_soundId?: string) => true);
const unlockAudio = vi.fn();
const requestNotifyPermission = vi.fn(async () => "granted");
const isNotifySupported = vi.fn(() => true);
const notifyPermission = vi.fn((): string | null => "granted");
vi.mock("@/lib/order-alerts", () => ({
  playSound: (id?: string) => playSound(id),
  unlockAudio: () => unlockAudio(),
  requestNotifyPermission: () => requestNotifyPermission(),
  isNotifySupported: () => isNotifySupported(),
  notifyPermission: () => notifyPermission(),
}));

import { SettingsForm } from "./settings-form";
import type { BoardSettings } from "@/lib/types";

const DEFAULTS: BoardSettings = {
  aging_min: 5,
  overdue_min: 10,
  sound_id: "chime",
  desktop_notify: false,
  undo_seconds: 4,
  daily_order_number_reset: false,
  show_wait_estimate: true,
  default_prep_minutes: null,
  ready_auto_clear_min: 3,
  customer_telegram_notify_enabled: true,
  pickup_scan_enabled: false,
};

const PREP_ESTIMATE = { avgMinutes: null, sampleCount: 0, minSample: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  updateBoardSettings.mockReset();
  playSound.mockClear();
  unlockAudio.mockClear();
  requestNotifyPermission.mockClear();
  notifyPermission.mockReturnValue("granted");
  isNotifySupported.mockReturnValue(true);
});

describe("SettingsForm hints", () => {
  it("opens a hint on a tap, since the form is used on touch screens", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    expect(
      screen.queryByText(/before its ticket turns amber/i),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "About the amber threshold" }),
    );

    expect(
      await screen.findByText(/before its ticket turns amber/i),
    ).toBeInTheDocument();
  });

  it("gives every hint its own name", () => {
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const names = screen
      .getAllByRole("button", { name: /^About / })
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toHaveLength(10);
    expect(new Set(names).size).toBe(10);
  });
});

describe("SettingsForm thresholds", () => {
  it("reports a timing transport rejection and leaves values available for retry", async () => {
    updateBoardSettings
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);
    const aging = screen.getByLabelText(/turn amber after/i);
    await user.clear(aging);
    await user.type(aging, "3");
    const save = screen.getByRole("button", { name: /save timing/i });
    await user.click(save);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save timing settings. Please try again.",
      ),
    );
    expect(aging).toHaveValue(3);
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(updateBoardSettings).toHaveBeenCalledTimes(2));
  });
  it("rejects overdue <= aging without calling the action", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const overdue = screen.getByLabelText(/turn red after/i);
    await user.clear(overdue);
    await user.type(overdue, "3");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(
      screen.getByText(/overdue must be later than amber/i),
    ).toBeInTheDocument();
    expect(updateBoardSettings).not.toHaveBeenCalled();
  });

  it("saves valid thresholds", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const aging = screen.getByLabelText(/turn amber after/i);
    await user.clear(aging);
    await user.type(aging, "3");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ aging_min: 3, overdue_min: 10 }),
    );
    expect(Object.keys(updateBoardSettings.mock.calls[0][0]).sort()).toEqual([
      "aging_min",
      "overdue_min",
      "ready_auto_clear_min",
      "undo_seconds",
    ]);
  });

  it("saves a changed undo window", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const undoSeconds = screen.getByLabelText(/undo window/i);
    await user.clear(undoSeconds);
    await user.type(undoSeconds, "8");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ undo_seconds: 8 }),
    );
  });

  it("rejects an undo window outside 2-15s without calling the action", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const undoSeconds = screen.getByLabelText(/undo window/i);
    await user.clear(undoSeconds);
    await user.type(undoSeconds, "30");
    await user.click(screen.getByRole("button", { name: /save timing/i }));

    expect(updateBoardSettings).not.toHaveBeenCalled();
  });

  it("saves a changed ready-auto-clear minutes value", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/auto-clear after/i);
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: /save timing/i }));
    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ ready_auto_clear_min: 5 }),
    );
  });
});

describe("SettingsForm customer notify toggle", () => {
  it("renders next to Auto-clear after, defaults checked, and saves the moment it is flipped", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const toggle = screen.getByRole("switch", {
      name: /notify customers on telegram when their order is ready/i,
    });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() =>
      expect(updateBoardSettings).toHaveBeenCalledWith({
        customer_telegram_notify_enabled: false,
      }),
    );
  });

  it("flips back and says so when the save is refused", async () => {
    updateBoardSettings.mockResolvedValue({
      success: false,
      error: "Could not save settings",
    });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const toggle = screen.getByRole("switch", {
      name: /notify customers on telegram when their order is ready/i,
    });
    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(toast.error).toHaveBeenCalledWith("Could not save settings");
  });

  it("defaults to checked for a legacy vendor row that predates this key", () => {
    const { customer_telegram_notify_enabled: _omit, ...legacyRest } = DEFAULTS;
    const legacyInitial = legacyRest as unknown as BoardSettings;
    render(
      <SettingsForm initial={legacyInitial} prepEstimate={PREP_ESTIMATE} />,
    );

    expect(
      screen.getByRole("switch", {
        name: /notify customers on telegram when their order is ready/i,
      }),
    ).toBeChecked();
  });
});

describe("SettingsForm pickup-scan toggle", () => {
  it("saves pickup_scan_enabled when the switch is toggled", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    await user.click(
      screen.getByRole("switch", { name: /self-checkout pickup/i }),
    );

    await waitFor(() =>
      expect(updateBoardSettings).toHaveBeenCalledWith({
        pickup_scan_enabled: true,
      }),
    );
  });
});

describe("SettingsForm sound", () => {
  it("restores the saved selection after a transport failure so the same preset can be retried", async () => {
    updateBoardSettings
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);
    await user.click(screen.getByRole("radio", { name: "Bell" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save your sound. Please try again.",
      ),
    );
    expect(screen.getByRole("radio", { name: "Chime" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Bell" }));
    await waitFor(() => expect(updateBoardSettings).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("radio", { name: "Bell" })).toBeChecked();
  });
  it("selecting a preset previews it and saves immediately", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    await user.click(screen.getByRole("radio", { name: "Bell" }));
    expect(playSound).toHaveBeenCalledWith("bell");
    expect(updateBoardSettings).toHaveBeenCalledWith({ sound_id: "bell" });
  });
});

describe("SettingsForm desktop notifications", () => {
  it("keeps the last saved toggle after transport failure so retry enables rather than disables it", async () => {
    updateBoardSettings
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);
    const toggle = screen.getByRole("switch", {
      name: "Desktop notifications",
    });
    await user.click(toggle);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not update notifications. Please try again.",
      ),
    );
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(updateBoardSettings.mock.calls.map((call) => call[0])).toEqual([
      { desktop_notify: true },
      { desktop_notify: true },
    ]);
  });
  it("turning on requests permission then saves", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    await user.click(
      screen.getByRole("switch", { name: /desktop notifications/i }),
    );
    expect(requestNotifyPermission).toHaveBeenCalled();
    expect(updateBoardSettings).toHaveBeenCalledWith({ desktop_notify: true });
  });

  it("reverts and shows an error when permission is denied", async () => {
    requestNotifyPermission.mockResolvedValueOnce("denied");
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    await user.click(
      screen.getByRole("switch", { name: /desktop notifications/i }),
    );
    expect(updateBoardSettings).not.toHaveBeenCalled();
    expect(
      screen.getByRole("switch", { name: /desktop notifications/i }),
    ).not.toBeChecked();
    expect(toast.error).toHaveBeenCalledWith(
      "Notifications blocked. Enable them for this site in your browser settings, then try again.",
    );
  });

  it("offers an in-browser enable button when already on but not granted, without touching the account setting", async () => {
    notifyPermission.mockReturnValue("default");
    requestNotifyPermission.mockResolvedValueOnce("granted");
    const user = userEvent.setup();
    render(
      <SettingsForm
        initial={{ ...DEFAULTS, desktop_notify: true }}
        prepEstimate={PREP_ESTIMATE}
      />,
    );

    expect(
      screen.getByText(/not allowed in this browser yet/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /enable in this browser/i }),
    );

    expect(requestNotifyPermission).toHaveBeenCalled();
    expect(updateBoardSettings).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/not allowed in this browser yet/i),
    ).not.toBeInTheDocument();
  });

  it("hydrates cleanly when the browser's answer differs from the server's", async () => {
    const form = (
      <SettingsForm
        initial={{ ...DEFAULTS, desktop_notify: true }}
        prepEstimate={PREP_ESTIMATE}
      />
    );
    isNotifySupported.mockReturnValue(false);
    notifyPermission.mockReturnValue(null);
    const container = document.createElement("div");
    container.innerHTML = renderToString(form);
    document.body.appendChild(container);

    isNotifySupported.mockReturnValue(true);
    notifyPermission.mockReturnValue("default");
    const onRecoverableError = vi.fn();
    const root = await act(async () =>
      hydrateRoot(container, form, { onRecoverableError }),
    );

    try {
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(
        within(container).getByText(/not allowed in this browser yet/i),
      ).toBeInTheDocument();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

describe("SettingsForm customer order screen", () => {
  it("saves the daily order-number reset toggle", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    await user.click(
      screen.getByRole("switch", {
        name: /show a simple daily order number instead of the permanent one/i,
      }),
    );

    await waitFor(() =>
      expect(updateBoardSettings).toHaveBeenCalledWith({
        daily_order_number_reset: true,
      }),
    );
  });

  it("saves the show-wait-estimate toggle and disables the backup-prep input while it's off", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const toggle = screen.getByRole("switch", {
      name: /show a wait-time estimate to customers/i,
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(screen.getByLabelText(/backup prep time/i)).toBeDisabled();

    await waitFor(() =>
      expect(updateBoardSettings).toHaveBeenCalledWith({
        show_wait_estimate: false,
      }),
    );
  });

  it("saves a configured backup prep time", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const prepMin = screen.getByLabelText(/backup prep time/i);
    await user.type(prepMin, "8");
    await user.click(screen.getByRole("button", { name: /save backup time/i }));

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ default_prep_minutes: 8 }),
    );
  });

  it("saves null when the backup prep time is cleared", async () => {
    updateBoardSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <SettingsForm
        initial={{ ...DEFAULTS, default_prep_minutes: 8 }}
        prepEstimate={PREP_ESTIMATE}
      />,
    );

    const prepMin = screen.getByLabelText(/backup prep time/i);
    await user.clear(prepMin);
    await user.click(screen.getByRole("button", { name: /save backup time/i }));

    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ default_prep_minutes: null }),
    );
  });

  it("rejects a backup prep time outside 1-60min without calling the action", async () => {
    const user = userEvent.setup();
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    const prepMin = screen.getByLabelText(/backup prep time/i);
    await user.type(prepMin, "90");
    await user.click(screen.getByRole("button", { name: /save backup time/i }));

    expect(updateBoardSettings).not.toHaveBeenCalled();
  });

  it("shows a not-enough-history disclaimer naming the queue-position fallback when no backup is set", () => {
    render(<SettingsForm initial={DEFAULTS} prepEstimate={PREP_ESTIMATE} />);

    expect(
      screen.getByText(/not enough recent order history yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/their queue position/i)).toBeInTheDocument();
  });

  it("names the backup number in the disclaimer once one is set", () => {
    render(
      <SettingsForm
        initial={{ ...DEFAULTS, default_prep_minutes: 8 }}
        prepEstimate={PREP_ESTIMATE}
      />,
    );

    expect(screen.getByText(/this backup number/i)).toBeInTheDocument();
  });

  it("shows the live estimate instead of the disclaimer once enough history exists", () => {
    render(
      <SettingsForm
        initial={DEFAULTS}
        prepEstimate={{ avgMinutes: 4, sampleCount: 20, minSample: 10 }}
      />,
    );

    expect(screen.getByText(/live right now/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/not enough recent order history yet/i),
    ).not.toBeInTheDocument();
  });
});
