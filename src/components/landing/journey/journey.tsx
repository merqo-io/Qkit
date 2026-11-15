import type { ReactNode, Ref } from "react";

import { cn } from "@merqo/ui/primitives";

// Structure only: the kit supplies tokens through the semantic classes and
// the product objects arrive as children, so this can move to @merqo/ui.

export function Journey({
  id,
  title,
  children,
  className,
}: {
  id?: string;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("mx-auto max-w-5xl scroll-mt-20 px-5 py-10", className)}
    >
      <h2 className="font-display max-w-[30ch] text-balance text-3xl font-semibold leading-[1.08] sm:text-4xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function JourneyStep({
  label,
  heading,
  say,
  extra,
  stage,
  stepRef,
}: {
  label: string;
  heading: ReactNode;
  say: ReactNode;
  extra?: ReactNode;
  stage: ReactNode;
  stepRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={stepRef}
      className="mt-10 grid items-center gap-8 border-t-[1.5px] border-dashed border-border pt-10 md:grid-cols-[5fr_7fr] md:gap-10 md:py-14"
    >
      <div className="min-w-0">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-primary">
          {label}
        </p>
        <h3 className="font-display mt-2.5 text-balance text-2xl font-semibold leading-[1.1] sm:text-3xl">
          {heading}
        </h3>
        <p className="mt-3 max-w-[36ch] text-muted-foreground">{say}</p>
        {extra}
      </div>
      <div className="flex min-w-0 flex-wrap items-start justify-center gap-4">
        {stage}
      </div>
    </div>
  );
}
