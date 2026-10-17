// The dashboard's headline figures, as a description list: what each figure
// counts, the figure, and a line of context.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** One figure: a label, the value, and context under it. */
export interface Figure {
  label: string;
  value: string;
  detail: ReactNode;
  icon: LucideIcon;
}

export function Figures({ figures }: { figures: readonly Figure[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
      {figures.map(({ label, value, detail, icon: Icon }) => (
        <div
          key={label}
          // Each figure spans three of the list's rows (label, value,
          // detail), so a label that wraps lowers its whole row of figures.
          className="row-span-3 grid grid-rows-subgrid gap-1 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10"
        >
          <dt className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
            {label}
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          </dt>
          <dd className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
            {value}
          </dd>
          <dd className="text-xs text-muted-foreground">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
