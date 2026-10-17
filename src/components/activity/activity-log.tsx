// The audit trail as a table: when, who, what, and which student, newest
// first, a page at a time.
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { ActivityEntry, ActivityPage } from "@/server/services/activity";

export function ActivityLog({
  page,
  timeZone,
}: {
  page: ActivityPage;
  timeZone: string;
}) {
  if (page.total === 0) {
    return <p className="text-muted-foreground">Nothing has changed yet.</p>;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>What</TableHead>
            <TableHead>Student</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap">
                {formatDateTime(entry.occurredAt, timeZone)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Actor entry={entry} />
              </TableCell>
              <TableCell className="min-w-64 whitespace-normal">
                {entry.description}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {entry.student && (
                  <Link
                    href={`/staff/students/${entry.student.studentNumber}`}
                    className="underline underline-offset-4"
                  >
                    {entry.student.fullName}
                  </Link>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <nav
        aria-label="Pages"
        className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        <p className="text-muted-foreground">
          {page.total} {page.total === 1 ? "change" : "changes"} in all
        </p>
        {page.pageCount > 1 && (
          <div className="flex items-center gap-2">
            <PageLink page={page.page - 1} disabled={page.page <= 1}>
              Newer
            </PageLink>
            <span>
              Page {page.page} of {page.pageCount}
            </span>
            <PageLink
              page={page.page + 1}
              disabled={page.page >= page.pageCount}
            >
              Older
            </PageLink>
          </div>
        )}
      </nav>
    </>
  );
}

/** Who made a change; a student acting for themselves says so. */
export function Actor({ entry }: { entry: ActivityEntry }) {
  return (
    <>
      {entry.actor.name}
      {entry.actor.role === "student" && (
        <span className="text-muted-foreground"> (student)</span>
      )}
    </>
  );
}

function PageLink({
  page,
  disabled,
  children,
}: {
  page: number;
  disabled: boolean;
  children: string;
}) {
  // The size of the page count between the links (text-sm).
  const style = buttonVariants({ variant: "outline" });
  if (disabled) {
    return (
      <span aria-disabled="true" className={`${style} opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={page === 1 ? "/staff/activity" : `/staff/activity?page=${page}`}
      className={style}
    >
      {children}
    </Link>
  );
}
