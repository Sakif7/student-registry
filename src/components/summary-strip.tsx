// Key facts under a page's title, each in a cell of its own: what it is,
// where it stands, and a line of detail. A dot or bar in the fact's tone
// helps the eye; the words carry the meaning. A fact can open the part of
// the page that explains it: its label is a link, stretched over the whole
// cell. Cells wrap onto more rows on narrow screens (two to a row on a
// phone), and the last row's cells widen to fill it.
import { cn } from "cn";
import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Meter } from "./meter";
import { RecordTabLink } from "./record-tabs";
import { type Tone, TONE_COLOURS } from "./tone";

export interface SummaryFact {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  tone?: Tone;
  detail?: ReactNode;
  /** Drawn as a bar under the value, which states the figures. */
  progress?: { value: number; max: number };
  /**
   * Where the fact is explained: another page, or a tab of the record the
   * strip sits on (in the header of RecordTabs).
   */
  link?: { href: string } | { tab: string };
}

/** Stretches the label's link over its cell, which shows the focus. */
const LINK_CLASS = "after:absolute after:inset-0 focus-visible:outline-none";

export function SummaryStrip({ facts }: { facts: readonly SummaryFact[] }) {
  return (
    <dl className="flex flex-wrap gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className={cn(
            "relative flex min-w-0 flex-[1_1_calc(50%-1px)] flex-col gap-1.5 bg-card p-3 sm:flex-[1_1_11rem] sm:p-4",
            fact.link &&
              "transition-colors has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-inset has-[a:hover]:bg-muted/60",
          )}
        >
          <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <fact.icon aria-hidden className="size-3.5 shrink-0" />
            {fact.link ? (
              <FactLink link={fact.link}>{fact.label}</FactLink>
            ) : (
              fact.label
            )}
            {fact.link && (
              <ChevronRight aria-hidden className="ml-auto size-3.5 shrink-0" />
            )}
          </dt>
          <dd className="grid gap-2">
            <span className="flex items-center gap-2 font-semibold">
              {fact.tone && (
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    TONE_COLOURS[fact.tone],
                  )}
                />
              )}
              <span className="min-w-0 tabular-nums">{fact.value}</span>
            </span>
            {fact.progress && (
              <Meter
                value={fact.progress.value}
                max={fact.progress.max}
                tone={fact.tone}
              />
            )}
          </dd>
          {fact.detail && (
            <dd className="line-clamp-2 text-xs text-muted-foreground">
              {fact.detail}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function FactLink({
  link,
  children,
}: {
  link: NonNullable<SummaryFact["link"]>;
  children: ReactNode;
}) {
  return "tab" in link ? (
    <RecordTabLink tab={link.tab} className={LINK_CLASS}>
      {children}
    </RecordTabLink>
  ) : (
    <Link href={link.href} className={LINK_CLASS}>
      {children}
    </Link>
  );
}
