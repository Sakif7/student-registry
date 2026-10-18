// The audit trail as a table: when, who, what, and which student, newest
// first, a page at a time. Page links keep the search and the kind of
// change.
import Link from "next/link";

import { listHref } from "@/components/lists/list-params";
import { Pagination } from "@/components/lists/pagination";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActivityQuery } from "@/domain/audit";
import { formatDateTime } from "@/lib/format";
import type { ActivityEntry, ActivityPage } from "@/server/services/activity";

export function ActivityLog({
  page,
  query,
  timeZone,
}: {
  page: ActivityPage;
  /** The search and kind of change applied now. */
  query: ActivityQuery;
  timeZone: string;
}) {
  if (page.total === 0 && (query.q || query.area)) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No changes match these filters.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a shorter search, or{" "}
          <Link href="/staff/activity" className="underline underline-offset-4">
            clear the filters
          </Link>
          .
        </p>
      </div>
    );
  }
  if (page.total === 0) {
    return <p className="text-muted-foreground">Nothing has changed yet.</p>;
  }
  return (
    <>
      <Table>
        <TableCaption className="sr-only">
          Changes matching the search and filters, newest first
        </TableCaption>
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
      <Pagination
        page={page}
        noun="change"
        previous="Newer"
        next="Older"
        hrefFor={(number) =>
          listHref("/staff/activity", {
            q: query.q,
            area: query.area,
            page: number > 1 ? number : undefined,
          })
        }
      />
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
