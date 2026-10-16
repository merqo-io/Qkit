// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintingSection } from "./printing-section";

type StatusBody = {
  reachable: boolean;
  configured?: boolean;
  manage_url?: string | null;
  printer: {
    display_name: string;
    state: "online" | "offline" | "not_set_up";
    hardware_verified: boolean;
  } | null;
};

function respondsWith(body: StatusBody | null) {
  const fetchMock = vi.fn(async () =>
    body
      ? new Response(JSON.stringify(body))
      : new Response("{}", { status: 500 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const PICKER_URL =
  "https://printkit.test/dashboard/printers/new?location=loc-1";
const ROW_URL = "https://printkit.test/dashboard/printers#booth-loc-1";

const ONLINE: StatusBody = {
  reachable: true,
  manage_url: ROW_URL,
  printer: {
    display_name: "Feie FP-N20H",
    state: "online",
    hardware_verified: false,
  },
};

const OFFLINE: StatusBody = {
  reachable: true,
  manage_url: ROW_URL,
  printer: {
    display_name: "Feie FP-N20H",
    state: "offline",
    hardware_verified: false,
  },
};

const NO_PRINTER: StatusBody = {
  reachable: true,
  manage_url: PICKER_URL,
  printer: null,
};

describe("PrintingSection", () => {
  const originalUrl = process.env.NEXT_PUBLIC_PRINTKIT_URL;

  beforeEach(() => {
    respondsWith(NO_PRINTER);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // process.env.X = undefined stringifies to "undefined" in Node, not
    // unset — delete instead when there was nothing there to restore.
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_PRINTKIT_URL;
    else process.env.NEXT_PUBLIC_PRINTKIT_URL = originalUrl;
  });

  it("calls onChange with the new value when toggled", () => {
    const onChange = vi.fn();
    render(<PrintingSection savedEnabled value={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects a true value as checked", () => {
    render(<PrintingSection savedEnabled value={true} onChange={vi.fn()} />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("asks printkit nothing until the booth has been saved", () => {
    const fetchMock = respondsWith(NO_PRINTER);
    render(<PrintingSection savedEnabled value={false} onChange={vi.fn()} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the printer even while printing is off, so the toggle can warn", async () => {
    const fetchMock = respondsWith(OFFLINE);
    render(
      <PrintingSection
        savedEnabled
        value={false}
        onChange={vi.fn()}
        boothId="b1"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("reads this booth's status through qkit, never printkit directly", async () => {
    const fetchMock = respondsWith(ONLINE);
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/printkit/printer-status?booth=booth-42",
        expect.anything(),
      );
    });
  });

  it("names the connected printer", async () => {
    respondsWith(ONLINE);
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(await screen.findByText("Printer connected")).toBeInTheDocument();
    expect(screen.getByText("Feie FP-N20H")).toBeInTheDocument();
  });

  it("warns that orders will not print when no printer is set up", async () => {
    respondsWith(NO_PRINTER);
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(
      await screen.findByText(/no printer is set up for this booth yet/i),
    ).toBeInTheDocument();
  });

  it("confirms before turning printing on while the printer is offline", async () => {
    const onChange = vi.fn();
    const fetchMock = respondsWith(OFFLINE);
    render(
      <PrintingSection
        savedEnabled
        value={false}
        onChange={onChange}
        boothId="booth-42"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: /turn on anyway/i }),
    ).toBeInTheDocument();
  });

  it("turns printing on without asking when the printer is online", async () => {
    const onChange = vi.fn();
    const fetchMock = respondsWith(ONLINE);
    render(
      <PrintingSection
        savedEnabled
        value={false}
        onChange={onChange}
        boothId="booth-42"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("prompts to save the booth first when enabled but unsaved, with no link", () => {
    render(<PrintingSection savedEnabled value={true} onChange={vi.fn()} />);

    expect(
      screen.getByText(
        "Save this booth first to choose its printer in printkit.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says printkit is unreachable rather than claiming no printer, with no link", async () => {
    respondsWith(null);
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(
      await screen.findByText(/can't reach printkit/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the page printkit names for a booth with no printer", async () => {
    respondsWith(NO_PRINTER);
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    const link = await screen.findByRole("link", {
      name: "Choose the printer for this booth →",
    });
    expect(link).toHaveAttribute("href", PICKER_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links to the page printkit names for a booth that has a printer", async () => {
    respondsWith(ONLINE);
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(
      await screen.findByRole("link", {
        name: "Manage this booth's printer in printkit →",
      }),
    ).toHaveAttribute("href", ROW_URL);
  });

  it("still links to the printer's page while the printer is offline", async () => {
    respondsWith(OFFLINE);
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(await screen.findByText("Printer offline")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Manage this booth's printer in printkit →",
      }),
    ).toHaveAttribute("href", ROW_URL);
  });

  it("shows no link while the first status read is in flight", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(screen.getByText(/checking the printer/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("builds no printkit link of its own when printkit names no page", async () => {
    process.env.NEXT_PUBLIC_PRINTKIT_URL = "https://printkit.test";
    respondsWith({ reachable: true, printer: null });
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(
      await screen.findByText(/no printer is set up for this booth yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to printkit itself, not the booth's printer page, while printing is off", async () => {
    respondsWith(ONLINE);
    render(
      <PrintingSection
        savedEnabled
        value={false}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    const link = await screen.findByRole("link", { name: "Open printkit →" });
    expect(link).toHaveAttribute("href", "https://printkit.test/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.queryByRole("link", { name: /this booth's printer/i }),
    ).not.toBeInTheDocument();
  });

  it("shows no link while printing is off and printkit names no page", async () => {
    const fetchMock = respondsWith({ reachable: true, printer: null });
    render(
      <PrintingSection
        savedEnabled
        value={false}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("carries no printer advice of its own", async () => {
    respondsWith(NO_PRINTER);
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    await screen.findByRole("link", {
      name: "Choose the printer for this booth →",
    });
    expect(screen.queryByText(/iPad/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bluetooth/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /read why/i }),
    ).not.toBeInTheDocument();
  });

  it("asks to save first when printing is switched on but saved off", async () => {
    const fetchMock = respondsWith({ reachable: true, printer: null });
    render(
      <PrintingSection
        savedEnabled={false}
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(
      screen.getByText(
        "Save this booth first to choose its printer in printkit.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no printer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never turns a manage_url that is not http(s) into a link", async () => {
    respondsWith({
      reachable: true,
      manage_url: "javascript:alert(1)",
      printer: null,
    });
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(
      await screen.findByText(/no printer is set up for this booth yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says printing is not configured, not that printkit is down", async () => {
    respondsWith({ reachable: false, configured: false, printer: null });
    render(
      <PrintingSection
        savedEnabled
        value={true}
        onChange={vi.fn()}
        boothId="booth-42"
      />,
    );

    expect(
      await screen.findByText("Printing isn't configured yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/can't reach printkit/i)).not.toBeInTheDocument();
  });
});
