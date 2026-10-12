"use client";

import { useEffect, useState } from "react";

export type PrinterSummary = {
  displayName: string;
  state: "online" | "offline" | "not_set_up";
  hardwareVerified: boolean;
};

export type PrinterStatusView =
  | { kind: "loading" }
  | { kind: "unreachable" }
  | { kind: "unconfigured" }
  | { kind: "none"; manageUrl: string | null }
  | { kind: "printer"; printer: PrinterSummary; manageUrl: string | null };

const REFRESH_MS = 30_000;

type StatusBody = {
  reachable?: boolean;
  configured?: boolean;
  manage_url?: string | null;
  printer?: {
    display_name: string;
    state: "online" | "offline" | "not_set_up";
    hardware_verified: boolean;
  } | null;
};

// The server keeps only http(s) links. Checked again here so a value from
// any other source can never become an href.
function httpUrlOrNull(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value)
    ? value
    : null;
}

/**
 * Reads a booth's printer from printkit, which owns that fact for every kind
 * of printer -- a cloud printer, a 4G printer and a Bluetooth bridge all
 * report the same way. The call goes through qkit's own route handler so the
 * printkit secret never reaches the browser.
 *
 * `manageUrl` is the printkit page for this booth's printer, as printkit
 * names it, or null when printkit named none.
 */
export function usePrinterStatus(boothId?: string | null): PrinterStatusView {
  const [view, setView] = useState<PrinterStatusView>({ kind: "loading" });

  useEffect(() => {
    if (!boothId) return;

    let active = true;
    const read = async () => {
      try {
        const response = await fetch(
          `/api/printkit/printer-status?booth=${encodeURIComponent(boothId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(String(response.status));

        const body = (await response.json()) as StatusBody;
        if (!active) return;

        if (!body.reachable) {
          setView(
            body.configured === false
              ? { kind: "unconfigured" }
              : { kind: "unreachable" },
          );
          return;
        }
        const manageUrl = httpUrlOrNull(body.manage_url);
        setView(
          body.printer
            ? {
                kind: "printer",
                printer: {
                  displayName: body.printer.display_name,
                  state: body.printer.state,
                  hardwareVerified: body.printer.hardware_verified,
                },
                manageUrl,
              }
            : { kind: "none", manageUrl },
        );
      } catch {
        if (active) setView({ kind: "unreachable" });
      }
    };

    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [boothId]);

  // An unsaved booth has nothing to ask about, so that case is derived here
  // rather than written into state from an effect.
  return boothId ? view : { kind: "none", manageUrl: null };
}
