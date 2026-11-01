"use client";

import { Download } from "lucide-react";
import { salesSummaryToCsv, toSalesSummaryV1 } from "@/lib/sales-summary";
import type { StatsSummary } from "@/lib/stats";

export function ExportButton({
  summary,
  range,
  boothId,
}: {
  summary: StatsSummary;
  range: string;
  boothId: string;
}) {
  function download() {
    const v1 = toSalesSummaryV1(summary, {
      range,
      boothId,
      generatedAt: new Date().toISOString(),
    });
    const blob = new Blob([salesSummaryToCsv(v1, summary.topItems)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qkit-sales-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:min-h-11"
    >
      <Download className="size-3.5" />
      Export CSV
    </button>
  );
}
