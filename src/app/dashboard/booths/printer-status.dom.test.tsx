// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PrinterStatus } from "./printer-status";

describe("PrinterStatus", () => {
  it("names the printer and says it is connected", () => {
    render(
      <PrinterStatus
        view={{
          kind: "printer",
          printer: {
            displayName: "Feie FP-N20H",
            state: "online",
            hardwareVerified: false,
          },
          manageUrl: null,
        }}
      />,
    );

    expect(screen.getByText("Printer connected")).toBeInTheDocument();
    expect(screen.getByText("Feie FP-N20H")).toBeInTheDocument();
    expect(screen.queryByText(/switch it on/i)).not.toBeInTheDocument();
  });

  it("says what to do when the printer is offline", () => {
    render(
      <PrinterStatus
        view={{
          kind: "printer",
          printer: {
            displayName: "Star mC-Label2",
            state: "offline",
            hardwareVerified: false,
          },
          manageUrl: null,
        }}
      />,
    );

    expect(screen.getByText("Printer offline")).toBeInTheDocument();
    expect(screen.getByText(/switch it on/i)).toBeInTheDocument();
  });

  it("distinguishes a booth with no printer from an offline one", () => {
    render(<PrinterStatus view={{ kind: "none", manageUrl: null }} />);

    expect(screen.getByText(/no printer set up/i)).toBeInTheDocument();
    expect(screen.queryByText("Printer offline")).not.toBeInTheDocument();
  });

  it("says printkit is unreachable without blaming the printer", () => {
    render(<PrinterStatus view={{ kind: "unreachable" }} />);

    expect(screen.getByText(/can't reach printkit/i)).toBeInTheDocument();
  });

  it("says printing is not configured when qkit has no printkit settings", () => {
    render(<PrinterStatus view={{ kind: "unconfigured" }} />);

    expect(
      screen.getByText("Printing isn't configured yet."),
    ).toBeInTheDocument();
  });

  it("shows a checking state while the first read is in flight", () => {
    render(<PrinterStatus view={{ kind: "loading" }} />);

    expect(screen.getByText(/checking the printer/i)).toBeInTheDocument();
  });
});
