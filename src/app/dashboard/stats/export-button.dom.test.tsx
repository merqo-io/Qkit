// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportButton } from "./export-button";
import type { StatsSummary } from "@/lib/stats";

const { downloadBlob } = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock("@merqo/ui", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadBlob,
}));
vi.mock("@/lib/sales-summary", () => ({
  toSalesSummaryV1: () => ({}),
  salesSummaryToCsv: () => "a,b\n1,2",
}));

describe("ExportButton", () => {
  it("downloads the CSV on touch", async () => {
    const user = userEvent.setup();
    render(
      <ExportButton
        summary={{ topItems: [], itemTotals: {} } as unknown as StatsSummary}
        range="7d"
        boothId="b1"
      />,
    );
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("button", { name: "Export CSV" }),
    });
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(downloadBlob.mock.calls[0]![1]).toBe("qkit-sales-7d.csv");
  });
});
