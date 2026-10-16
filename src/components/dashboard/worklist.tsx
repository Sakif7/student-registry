// A short worklist on a dashboard card: the first few items, each a link
// with a line of detail, then how many more there are.
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyNote } from "./dashboard-card";

/** How many items a worklist shows. */
const SHOWN = 5;

export interface WorklistItem {
  key: string;
  href: string;
  label: string;
  detail: ReactNode;
}

export function Worklist({
  items,
  empty,
}: {
  items: readonly WorklistItem[];
  /** What to say when there is nothing to do. */
  empty: string;
}) {
  if (items.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  const more = items.length - SHOWN;
  return (
    <>
      <ul className="divide-y">
        {items.slice(0, SHOWN).map((item) => (
          <li
            key={item.key}
            className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0"
          >
            <Link
              href={item.href}
              className="w-fit text-sm font-medium underline-offset-4 hover:underline"
            >
              {item.label}
            </Link>
            <span className="text-xs text-muted-foreground">{item.detail}</span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">And {more} more.</p>
      )}
    </>
  );
}
