import Link from "next/link";
import { ArrowUpRight, Lightbulb, Info } from "lucide-react";
import type { HelpBlock } from "@/content/help";

function isInternal(href: string): boolean {
  return href.startsWith("/");
}

function BlockView({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2 className="font-display mt-10 text-xl font-semibold leading-snug first:mt-0">
          {block.text}
        </h2>
      ) : (
        <h3 className="font-display mt-6 text-lg font-semibold leading-snug">
          {block.text}
        </h3>
      );
    case "paragraph":
      return <p className="leading-relaxed text-foreground/85">{block.text}</p>;
    case "steps":
      return (
        <ol className="list-decimal space-y-2 pl-5 marker:font-semibold marker:text-primary">
          {block.items.map((item) => (
            <li key={item} className="pl-1 leading-relaxed text-foreground/85">
              {item}
            </li>
          ))}
        </ol>
      );
    case "bullets":
      return (
        <ul className="list-disc space-y-2 pl-5 marker:text-primary/60">
          {block.items.map((item) => (
            <li key={item} className="pl-1 leading-relaxed text-foreground/85">
              {item}
            </li>
          ))}
        </ul>
      );
    case "note":
    case "tip": {
      const Icon = block.type === "tip" ? Lightbulb : Info;
      return (
        <aside
          data-callout={block.type}
          className="flex gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground"
        >
          <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{block.text}</p>
        </aside>
      );
    }
    case "link": {
      const className =
        "inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline";
      return isInternal(block.href) ? (
        <Link href={block.href} className={className}>
          {block.text}
        </Link>
      ) : (
        <a
          href={block.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {block.text}
          <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      );
    }
  }
}

export function ArticleBody({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="space-y-4 text-[0.95rem]">
      {blocks.map((block, index) => (
        <BlockView key={`${block.type}-${index}`} block={block} />
      ))}
    </div>
  );
}
