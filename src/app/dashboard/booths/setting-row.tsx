import { Label } from "@/components/ui/label";
import { Hint } from "@/components/widgets/hint";

/**
 * One row of a booth setting: a short label with a tap-to-open hint on the
 * left, its control on the right. Every row on the booth page uses it, so
 * the controls line up in one right-hand column, and the explanation stays
 * one tap away instead of two or three lines of grey text under each label.
 *
 * `htmlFor` ties the label to an input; a switch names itself with its own
 * aria-label instead.
 */
export function SettingRow({
  label,
  hint,
  hintLabel,
  htmlFor,
  badge,
  children,
}: {
  label: string;
  hint: string;
  hintLabel: string;
  htmlFor?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <span className="flex min-w-0 flex-wrap items-center gap-y-1 text-sm font-medium">
        {htmlFor ? <Label htmlFor={htmlFor}>{label}</Label> : label}
        {badge}
        <Hint label={hintLabel}>{hint}</Hint>
      </span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
