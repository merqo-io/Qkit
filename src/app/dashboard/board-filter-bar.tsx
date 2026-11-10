import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@merqo/ui/primitives";

import { SegmentedControl } from "@merqo/ui";
import { boothDotTitle } from "@/lib/booth/color";
import type { AgeSortOrder } from "@/lib/orders";
import {
  boothFilterLabel,
  type BoothFilter,
  type BoothView,
} from "./board-booths";

const SORT_ORDERS: { value: AgeSortOrder; label: string }[] = [
  { value: "earliest", label: "Earliest" },
  { value: "latest", label: "Latest" },
];

export function BoardFilterBar({
  multiBooth,
  effectiveFilter,
  onFilterChange,
  visibleBooths,
  activeTotal,
  activeCountFor,
  boothColor,
  sortOrder,
  onSortChange,
}: {
  multiBooth: boolean;
  effectiveFilter: BoothFilter;
  onFilterChange: (filter: BoothFilter) => void;
  visibleBooths: BoothView[];
  activeTotal: number;
  activeCountFor: (id: string) => number;
  boothColor: Map<string, string>;
  sortOrder: AgeSortOrder;
  onSortChange: (order: AgeSortOrder) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      {/* A dropdown rather than a tab-per-booth row: a vendor running a
          large event (a dozen-plus booths) would otherwise get a wall of
          pills wrapping across several lines before a single order card is
          visible — the opposite of "one look and staff know what to do".
          A Select scales to any booth count without growing the header. */}
      {multiBooth && (
        <Select value={effectiveFilter} onValueChange={onFilterChange}>
          <SelectTrigger
            aria-label="Filter by booth"
            className="h-9 rounded-lg text-sm"
          >
            {/* The label is given outright. Left to Radix it is read off
                the selected item, which is not mounted until the list has
                been opened once, so the trigger painted empty on load. */}
            <SelectValue>
              {boothFilterLabel(
                effectiveFilter,
                visibleBooths,
                activeTotal,
                activeCountFor,
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All booths ({activeTotal})</SelectItem>
            {visibleBooths.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: boothColor.get(b.id) }}
                  title={boothDotTitle(b.name)}
                />
                <span className="truncate">
                  {b.name} ({activeCountFor(b.id)}){!b.open && " · closed"}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {/* Status-agnostic on purpose — a rush-hour vendor triaging "what's
          waited longest" needs an old ready-but-unclaimed order to
          surface too, not stay pinned below every preparing order just
          because of its status. A bumped order still always leads either
          way (see sortActiveOrders). */}
      <SegmentedControl
        ariaLabel="Sort by order age"
        options={SORT_ORDERS}
        value={sortOrder}
        onChange={onSortChange}
      />
    </div>
  );
}
