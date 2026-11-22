"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { HelpSearchEntry } from "@/content/help";
import { searchHelp } from "./help-search";

type Props = {
  index: HelpSearchEntry[];
  size?: "compact" | "large";
  hotkey?: boolean;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function HelpSearch({ index, size = "compact", hotkey = false }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-results`;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const trimmed = query.trim();
  const results = searchHelp(index, trimmed);
  const open = trimmed.length > 0;
  const activeId = results[active] ? `${baseId}-opt-${active}` : undefined;

  useEffect(() => {
    if (!hotkey) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkey]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      setActive(0);
    } else if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      router.push(`/dashboard/help/${results[active].slug}`);
    }
  }

  const large = size === "large";

  return (
    <div className="relative">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search the user guide"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search the guide"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className={`w-full rounded-xl border border-border bg-card pl-9 pr-3 text-foreground placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
            large ? "h-14 text-base" : "h-11 text-sm"
          }`}
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        hidden={!open}
        className="absolute inset-x-0 top-full z-30 mt-2 max-h-96 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
      >
        {open && results.length === 0 ? (
          <li role="presentation" className="px-3 py-3 text-sm">
            <p className="text-muted-foreground">
              No articles match &ldquo;{trimmed}&rdquo;.
            </p>
            <Link
              href="/dashboard/help/troubleshooting"
              className="mt-1 inline-block font-semibold text-primary underline-offset-4 hover:underline"
            >
              Try the Troubleshooting guide
            </Link>
          </li>
        ) : (
          results.map((result, i) => (
            <li
              key={result.slug}
              id={`${baseId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`rounded-lg ${i === active ? "bg-muted" : ""}`}
            >
              <Link
                href={`/dashboard/help/${result.slug}`}
                tabIndex={-1}
                className="block min-h-11 px-3 py-2"
              >
                <span className="block text-sm font-semibold text-foreground">
                  {result.title}
                </span>
                <span className="block font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">
                  {result.category}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {result.snippet}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
