const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decodes the JSX/HTML entities a label can be written with in source. */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, name: string) => {
      if (name.startsWith("#")) {
        const code =
          name[1] === "x" || name[1] === "X"
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return Number.isNaN(code) ? whole : String.fromCodePoint(code);
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    },
  );
}

function literalEnd(source: string, start: number): number {
  const quote = source[start];
  let j = start + 1;
  while (j < source.length) {
    const c = source[j];
    if (c === "\\") j += 2;
    else if (c === quote || (c === "\n" && quote !== "`")) break;
    else j++;
  }
  return j + 1;
}

/**
 * Blanks out // and block comments (JSX `{/* *\/}` included) while leaving
 * string and template literals intact, so a label that only survives inside a
 * comment no longer counts as visible UI text. Quoted strings end at a newline
 * because an apostrophe in JSX text would otherwise swallow the rest of the file.
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      out += " ";
    } else if (ch === '"' || ch === "'" || ch === "`") {
      const end = literalEnd(source, i);
      out += source.slice(i, end);
      i = end;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Source text as a user would see its string and JSX text content. */
export function visibleSourceText(source: string): string {
  return decodeEntities(stripComments(source));
}
