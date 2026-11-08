import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ticket } from "@/components/widgets/ticket";
import { LoadErrorBanner } from "./board-sections";

function NoBoothsTicket() {
  return (
    <Ticket
      shadow="none"
      dashed
      className="mx-auto mt-10 max-w-md p-10 text-center"
    >
      <p className="font-display text-2xl font-semibold">No booths yet</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Set up a booth to start receiving orders. Once it&apos;s live, every
        order lands here in real time.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
        <Button asChild className="rounded-lg">
          <Link href="/dashboard/booths/new">
            <Plus className="size-4" /> Add your first booth
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-lg">
          <Link href="/dashboard/booths/new?mode=event">
            <CalendarDays className="size-4" /> Set up for an event
          </Link>
        </Button>
      </div>
    </Ticket>
  );
}

export function DisconnectedBanner() {
  return (
    <div
      role="status"
      className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
    >
      Live updates interrupted, reconnecting. New orders may be delayed; the
      board re-syncs automatically once it&apos;s back.
    </div>
  );
}

export function AllCaughtUp() {
  return (
    <Ticket shadow="none" dashed className="mt-10 py-20 text-center">
      <p className="font-display text-2xl font-semibold">All caught up</p>
      <p className="mt-1 text-sm text-muted-foreground">
        No active orders. Standing by.
      </p>
    </Ticket>
  );
}

export function NoBoothsState({ loadError }: { loadError: boolean }) {
  return loadError ? <LoadErrorBanner /> : <NoBoothsTicket />;
}
