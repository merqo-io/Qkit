export type Oklch = readonly [number, number, number];

export function parseOklch(value: string): Oklch {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (!match) throw new Error("Expected an opaque OKLCH token: " + value);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** CSS Color 4 OKLab conversion, followed by WCAG relative luminance. */
function luminance([lightness, chroma, hue]: Oklch): number {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return (
    -0.0405757452148008 * l + 1.112286803280317 * m - 0.0717110580655164 * s
  );
}

export function contrast(first: Oklch, second: Oklch): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function mixOklch(first: Oklch, second: Oklch, alpha: number): Oklch {
  const toLab = ([l, c, h]: Oklch) => [
    l,
    c * Math.cos((h * Math.PI) / 180),
    c * Math.sin((h * Math.PI) / 180),
  ];
  const a = toLab(first);
  const b = toLab(second);
  const mixed = a.map((value, index) => value * alpha + b[index] * (1 - alpha));
  return [
    mixed[0],
    Math.hypot(mixed[1], mixed[2]),
    (Math.atan2(mixed[2], mixed[1]) * 180) / Math.PI,
  ];
}

export function themeModes(
  css: string,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const name of [":root", ".dark"]) {
    const start = css.indexOf(name + " {");
    const end = css.indexOf("}", start);
    if (start < 0 || end < 0) throw new Error("Missing theme mode: " + name);
    result[name] = Object.fromEntries(
      css
        .slice(start + name.length + 2, end)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("--"))
        .flatMap((declaration) => {
          const colon = declaration.indexOf(":");
          const key = declaration.slice(0, colon).trim();
          return [
            [
              key,
              declaration
                .slice(colon + 1)
                .replace(";", "")
                .trim(),
            ],
          ];
        }),
    );
  }
  return result;
}
