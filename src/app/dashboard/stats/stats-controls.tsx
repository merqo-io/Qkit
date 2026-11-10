"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { SegmentedControl } from "@merqo/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@merqo/ui/primitives";

const RANGES: { value: string; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

// The shared SegmentedControl has no link-style option, so ranges outside the
// plan render as upgrade links after the switchable ones inside one shared
// track. RANGES runs short to long, so the locked ranges are always the tail.
export function RangeControl({
  range,
  allowedRanges,
  onChange,
}: {
  range: string;
  allowedRanges: readonly string[];
  onChange: (value: string) => void;
}) {
  const switchable = RANGES.filter((r) => allowedRanges.includes(r.value));
  const locked = RANGES.filter((r) => !allowedRanges.includes(r.value));
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
      <SegmentedControl
        ariaLabel="Date range"
        value={range}
        onChange={onChange}
        options={switchable}
        className="rounded-none border-0 p-0"
      />
      {locked.map((r) => (
        <Link
          key={r.value}
          href="/dashboard/plan"
          title="Longer ranges are not on your plan"
          className="flex items-center gap-1 rounded-md px-3 py-1.5 font-medium text-muted-foreground/60 transition-colors hover:text-foreground [@media(pointer:coarse)]:min-h-11"
        >
          <Lock className="size-3" />
          {r.label}
        </Link>
      ))}
    </div>
  );
}

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
      <RangeControl
        range={range}
        allowedRanges={allowedRanges}
        onChange={(value) => setParam("range", value)}
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
