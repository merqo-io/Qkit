import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BoothRow, type BoothView } from "./board-booths";

/**
 * Every booth's pause switch behind the header's "Booths" button. A wall of
 * pause rows would otherwise wrap across the top of the board and push every
 * order card down, worse the more booths there are — exactly the clutter
 * problem a modal avoids regardless of booth count.
 */
export function BoothStatusDialog({
  open,
  onOpenChange,
  booths,
  withLiveCount,
  boothColor,
  boothIsActive,
  onToggle,
  onServiceStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booths: BoothView[];
  withLiveCount: (b: BoothView) => BoothView;
  boothColor: Map<string, string>;
  boothIsActive: (b: BoothView) => boolean;
  onToggle: (b: BoothView, active: boolean) => void;
  onServiceStarted: (boothId: string, startedAt: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Booth status</DialogTitle>
          <DialogDescription>
            Pause a booth to stop new orders landing without closing it for the
            day. Handy for clearing a rush-hour backlog. Resume anytime. Each
            booth&apos;s coloured dot also marks its tickets and its place in
            the booth filter.
          </DialogDescription>
        </DialogHeader>
        {/* Deliberately keyed on the full `booths` list, not visibleBooths,
            so a paused booth with no orders in flight (which
            visibleBooths would otherwise hide) stays reachable to turn
            back on. Instant toggle + an undo toast, same pattern as
            OrderCard's advance buttons: this needs to be fast and
            reversible, not gated behind a confirm step of its own. */}
        <div className="space-y-2">
          {booths.map((b) => (
            <BoothRow
              key={b.id}
              b={withLiveCount(b)}
              color={boothColor.get(b.id)}
              showDot
              active={boothIsActive(b)}
              onToggle={(checked) => onToggle(b, checked)}
              onServiceStarted={onServiceStarted}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
