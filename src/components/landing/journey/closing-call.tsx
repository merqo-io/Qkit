import type { ReactNode } from "react";

export function ClosingCall({
  heading,
  line,
  action,
  aside,
}: {
  heading: ReactNode;
  line: ReactNode;
  action: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="grid gap-8 border-t-[1.5px] border-dashed border-border py-12 md:grid-cols-[5fr_7fr] md:gap-10">
      <div>
        <h2 className="font-display text-balance text-2xl font-semibold leading-[1.1] sm:text-4xl">
          {heading}
        </h2>
        <p className="mt-3 max-w-[36ch] font-semibold text-foreground">
          {line}
        </p>
        <div className="mt-6">{action}</div>
      </div>
      <div className="min-w-0">{aside}</div>
    </div>
  );
}
