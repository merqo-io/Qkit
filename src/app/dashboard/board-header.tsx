import Link from "next/link";
import { Plus, Settings as SettingsIcon, Store } from "lucide-react";
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@merqo/ui/primitives";

import { BoothToggle, type BoothView } from "./board-booths";
import { CustomerScreenButton } from "./customer-screen-dialog";

const HEADER_BUTTON = "rounded-full";

function BoothHeaderControl({
  booths,
  selectedBooth,
  activeBoothCount,
  boothIsActive,
  onToggle,
  onOpenDialog,
}: {
  booths: BoothView[];
  selectedBooth: BoothView | undefined;
  activeBoothCount: number;
  boothIsActive: (b: BoothView) => boolean;
  onToggle: (b: BoothView, active: boolean) => void;
  onOpenDialog: () => void;
}) {
  if (selectedBooth) {
    return (
      <BoothToggle
        active={boothIsActive(selectedBooth)}
        onChange={(checked) => onToggle(selectedBooth, checked)}
        boothName={selectedBooth.name}
      />
    );
  }
  if (booths.length <= 1) return null;
  return (
    <Button
      variant="outline"
      className={HEADER_BUTTON}
      onClick={onOpenDialog}
      aria-label={`Booth status, ${activeBoothCount} of ${booths.length} open`}
    >
      <Store className="size-3.5" />
      {/* One flex child, not four: Button's `gap-2` inserts space
          between EVERY direct child, so "Booths · "/count/" open"
          as separate children each got an extra gap stacked on
          top of their own literal spaces. Wrapping the label in a
          single span makes gap-2 fire once (icon → label). */}
      <span>
        <span className="hidden sm:inline">Booths · </span>
        {activeBoothCount}/{booths.length}
        <span className="hidden sm:inline"> open</span>
      </span>
    </Button>
  );
}

function ActiveCountPill({ idle, count }: { idle: boolean; count: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
        idle ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
      )}
    >
      <span className="relative flex size-2">
        {!idle && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            idle ? "bg-success" : "bg-primary",
          )}
        />
      </span>
      {/* A phone shows the count alone, so the header's controls and
          this stay on one row; "active" is still read out. */}
      {idle ? (
        "All clear"
      ) : (
        <span>
          {count}
          <span className="sr-only sm:not-sr-only"> active</span>
        </span>
      )}
    </span>
  );
}

export function BoardHeader({
  booths,
  selectedBooth,
  activeBoothCount,
  boothIsActive,
  onToggleBooth,
  onOpenBoothDialog,
  onNewOrder,
  idle,
  visibleCount,
}: {
  booths: BoothView[];
  selectedBooth: BoothView | undefined;
  activeBoothCount: number;
  boothIsActive: (b: BoothView) => boolean;
  onToggleBooth: (b: BoothView, active: boolean) => void;
  onOpenBoothDialog: () => void;
  onNewOrder: () => void;
  idle: boolean;
  visibleCount: number;
}) {
  return (
    <div
      data-tour="order-board"
      className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <h1 className="font-display text-3xl font-semibold leading-none sm:text-4xl">
          Live orders
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BoothHeaderControl
          booths={booths}
          selectedBooth={selectedBooth}
          activeBoothCount={activeBoothCount}
          boothIsActive={boothIsActive}
          onToggle={onToggleBooth}
          onOpenDialog={onOpenBoothDialog}
        />
        <CustomerScreenButton
          booths={booths}
          defaultBoothId={selectedBooth?.id}
        />
        <Button
          variant="default"
          className={HEADER_BUTTON}
          onClick={onNewOrder}
          aria-label="New order"
          data-tour="new-order"
        >
          <Plus className="size-3.5" />
          {/* Same fix as the booth-status button above: one label child,
              not two, so gap-2 doesn't add space between "New" and the
              span on top of the span's own leading space. */}
          <span>
            New<span className="hidden sm:inline"> order</span>
          </span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="outline"
              size="icon"
              className="hidden rounded-full sm:inline-flex"
            >
              <Link href="/dashboard/settings" aria-label="Board settings">
                <SettingsIcon className="size-3.5" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Board settings</TooltipContent>
        </Tooltip>
        <ActiveCountPill idle={idle} count={visibleCount} />
      </div>
    </div>
  );
}
