"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/widgets/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGES: { value: string; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

interface Props {
  range: string;
  booth: string;
  booths: { id: string; name: string }[];
  allowedRanges: readonly string[];
}

export function StatsControls({ range, booth, booths, allowedRanges }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/dashboard/stats?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl
        ariaLabel="Date range"
        value={range}
        onChange={(value) => setParam("range", value)}
        options={RANGES.map((r) =>
          allowedRanges.includes(r.value)
            ? r
            : {
                ...r,
                lockedHref: "/dashboard/plan",
                lockedTitle: "Longer ranges are not on your plan",
              },
        )}
      />

      {booths.length > 1 && (
        <Select value={booth} onValueChange={(v) => setParam("booth", v)}>
          <SelectTrigger
            aria-label="Filter by booth"
            className="h-9 rounded-lg text-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All booths</SelectItem>
            {booths.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
