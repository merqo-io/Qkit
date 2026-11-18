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
    <Ticket shadow="none" className="relative w-full bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="min-w-0">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sample orders
          </p>
          <p className="truncate font-display text-sm font-semibold leading-tight">
            {board.title}
          </p>
        </div>
        <span className="text-xs font-semibold text-primary">
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
