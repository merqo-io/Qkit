// Data-driven "live order board" for the landing hero. Renders the ticket
// board container/header, taking its booth title + ticket data as a prop so
// the hero can carousel through multiple scenario boards.

import { Ticket } from "@/components/widgets/ticket";
import { LandingTicket, type LandingTicketData } from "./landing-ticket";

export type LandingBoardData = {
  key: string;
  title: string;
  activeCount: number;
  tickets: LandingTicketData[];
};

export function LandingBoard({ board }: { board: LandingBoardData }) {
  return (
    <Ticket
      shadow="none"
      className="relative w-full bg-card p-3 shadow-[0_1px_0_0_var(--color-border),0_24px_48px_-32px_oklch(0.4_0.06_45/0.45)] sm:p-4"
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sample orders
          </p>
          <p className="truncate font-display text-sm font-semibold leading-tight">
            {board.title}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {board.activeCount} active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
        {board.tickets.map((t) => (
          <LandingTicket key={t.n} t={t} />
        ))}
      </div>
    </Ticket>
  );
}
