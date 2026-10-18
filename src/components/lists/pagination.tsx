// Where a page of a list sits in the whole, with links to the pages either
// side. The links keep the list's search, filters and order. The count is
// announced as it changes, so a search's result is heard as well as seen.
import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { ListPage } from "@/domain/lists";
import { formatCount } from "@/lib/format";

export function Pagination({
  page: { page, pageCount, total, pageSize, items },
  noun,
  plural,
  hrefFor,
  label = "Pages",
}: {
  page: ListPage<unknown>;
  /** What the list holds, e.g. "assessment". */
  noun: string;
  plural?: string;
  /** The address of another page of the list. */
  hrefFor: (page: number) => string;
  /** The navigation's name, when a page has more than one list. */
  label?: string;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = first + items.length - 1;
  return (
    <nav
      aria-label={label}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0
          ? `No ${plural ?? `${noun}s`}`
          : `Showing ${first}–${last} of ${formatCount(total, noun, plural)}`}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <PageLink href={page > 1 ? hrefFor(page - 1) : undefined}>
            Previous
          </PageLink>
          <span>
            Page {page} of {pageCount}
          </span>
          <PageLink href={page < pageCount ? hrefFor(page + 1) : undefined}>
            Next
          </PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({
  href,
  children,
}: {
  /** Absent on the first or last page. */
  href: string | undefined;
  children: ReactNode;
}) {
  const style = buttonVariants({ variant: "outline" });
  if (!href) {
    return (
      <span aria-disabled="true" className={`${style} opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} className={style}>
      {children}
    </Link>
  );
}
