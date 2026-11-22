import Link from "next/link";
import { ArrowUpRight, Lightbulb, Info } from "lucide-react";
import type { HelpBlock } from "@/content/help";

function isInternal(href: string): boolean {
  return href.startsWith("/");
}

export type ArticleHeading = { id: string; text: string };

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join("-");
  return slug || "section";
}

/** Stable per-article ids; a repeated heading gets a numeric suffix. */
function headingIds(blocks: HelpBlock[]): Map<number, string> {
  const seen = new Map<string, number>();
  const ids = new Map<number, string>();
  blocks.forEach((block, index) => {
    if (block.type !== "heading") return;
    const base = slugify(block.text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    ids.set(index, count === 1 ? base : `${base}-${count}`);
  });
  return ids;
}

export function articleHeadings(blocks: HelpBlock[]): ArticleHeading[] {
  const ids = headingIds(blocks);
  return blocks.flatMap((block, index) =>
    block.type === "heading" && block.level === 2
      ? [{ id: ids.get(index) ?? "", text: block.text }]
      : [],
  );
}

function BlockView({ block, id }: { block: HelpBlock; id?: string }) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h2
          id={id}
          className="font-display scroll-mt-6 mt-10 text-xl font-semibold leading-snug first:mt-0"
        >
          {block.text}
        </h2>
      ) : (
        <h3
          id={id}
          className="font-display scroll-mt-6 mt-6 text-lg font-semibold leading-snug"
        >
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
  const ids = headingIds(blocks);
  return (
    <div className="space-y-4 text-[0.95rem]">
      {blocks.map((block, index) => (
        <BlockView
          key={`${block.type}-${index}`}
          block={block}
          id={ids.get(index)}
        />
      ))}
    </div>
  );
}
