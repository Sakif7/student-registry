// One page of the student list, with a count and links to the other pages.
// Column headings sort the list, and each row has a menu of actions. Sorting
// and page links keep the current filters.
import Link from "next/link";

import { StandingBadge } from "@/components/fees/standing-badge";
import { Pagination } from "@/components/lists/pagination";
import { SortableHead } from "@/components/sortable-head";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudentFilters, StudentSort } from "@/domain/students";
import { formatDays, formatMoney } from "@/lib/format";
import type { StudentPage } from "@/server/services/students";

import { StudentRowMenu } from "./student-row-menu";

export function StudentTable({ page }: { page: StudentPage }) {
  if (page.total === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No students match these filters.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a shorter search, or{" "}
          <Link href="/staff/students" className="underline underline-offset-4">
            clear the filters
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableCaption className="sr-only">
          Students matching the search and filters
        </TableCaption>
        <TableHeader>
          <TableRow>
            <Sortable filters={page.filters} column="id" label="Student ID" />
            <Sortable filters={page.filters} column="name" label="Name" />
            <Sortable
              filters={page.filters}
              column="programme"
              label="Programme"
            />
            <Sortable
              filters={page.filters}
              column="year"
              label="Academic year"
            />
            <Sortable filters={page.filters} column="status" label="Status" />
            <TableHead>Fees</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((student) => (
            <TableRow key={student.studentNumber}>
              <TableCell className="font-mono">
                {student.studentNumber}
              </TableCell>
              <TableCell>
                <Link
                  href={`/staff/students/${student.studentNumber}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {student.fullName}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {student.email}
                </div>
              </TableCell>
              <TableCell className="min-w-36 whitespace-normal">
                {student.programme.title}
              </TableCell>
              <TableCell>{student.academicYear}</TableCell>
              <TableCell>
                <StatusBadge status={student.status} />
              </TableCell>
              <TableCell>
                <StandingBadge standing={student.account.standing} />
                {student.account.overduePence > 0 && (
                  <div className="text-xs text-red-900">
                    {formatMoney(student.account.overduePence)} ·{" "}
                    {formatDays(student.account.daysOverdue)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <StudentRowMenu
                  studentNumber={student.studentNumber}
                  fullName={student.fullName}
                  email={student.email}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination
        page={page}
        noun="student"
        hrefFor={(number) => studentListHref({ ...page.filters, page: number })}
      />
    </>
  );
}

/** A heading that sorts by its column, reversing a sort already applied. */
function Sortable({
  filters,
  column,
  label,
}: {
  filters: StudentFilters;
  column: StudentSort;
  label: string;
}) {
  const sort = filters.sort ?? "name";
  const dir = filters.dir ?? "asc";
  const active = sort === column;
  return (
    <SortableHead
      label={label}
      direction={active ? dir : undefined}
      href={studentListHref({
        ...filters,
        sort: column,
        dir: active && dir === "asc" ? "desc" : "asc",
        // A new order starts again at the first page.
        page: 1,
      })}
    />
  );
}

/**
 * The student list's address for these filters, leaving out the defaults
 * (first page, sorted by name A to Z) so addresses stay short.
 */
function studentListHref(filters: StudentFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    if (key === "page" && value === 1) continue;
    if (key === "sort" && value === "name" && filters.dir !== "desc") continue;
    if (key === "dir" && value === "asc") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/staff/students?${query}` : "/staff/students";
}
