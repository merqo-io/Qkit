"use client";

import { DownloadButton, downloadBlob } from "@merqo/ui";
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
    const blob = new Blob(
      [
        salesSummaryToCsv(v1, {
          items: summary.topItems,
          totals: summary.itemTotals,
        }),
      ],
      {
        type: "text/csv;charset=utf-8",
      },
    );
    downloadBlob(blob, `qkit-sales-${range}.csv`);
  }

  return (
    <DownloadButton
      label="Export CSV"
      onDownload={download}
      className="rounded-lg text-muted-foreground hover:text-foreground"
    />
  );
}
