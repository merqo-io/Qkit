import { Wordmark as SharedWordmark, type WordmarkProps } from "@merqo/ui";

export function Wordmark({
  size,
  className,
}: Pick<WordmarkProps, "size" | "className">) {
  return (
    <SharedWordmark size={size} className={className}>
      <span className="text-primary">q</span>
      kit
    </SharedWordmark>
  );
}
