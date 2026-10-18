// One page of the staff list of assessments, with each deadline, state and
// how many of the students expected to submit have done so. Column headings
// sort the list; sorting and page links keep the search and filters.
import Link from "next/link";

import { listHref } from "@/components/lists/list-params";
import { Pagination } from "@/components/lists/pagination";
import { SortableHead } from "@/components/sortable-head";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SEMESTER_LABELS } from "@/domain/curriculum";
import type { ListPage } from "@/domain/lists";
import type { AssessmentListQuery, AssessmentSort } from "@/domain/submissions";
import { formatDateTime } from "@/lib/format";
import type { AssessmentSummary } from "@/server/services/assessments";

import { AssessmentStateBadge } from "./assessment-badges";

export function AssessmentsTable({
  page,
  query,
  timeZone,
}: {
  page: ListPage<AssessmentSummary>;
  /** The search, filters and order applied now. */
  query: AssessmentListQuery;
  timeZone: string;
}) {
  if (page.total === 0 && (query.q || query.state || query.year)) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No assessments match these filters.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a shorter search, or{" "}
          <Link
            href="/staff/assessments"
            className="underline underline-offset-4"
          >
            clear the filters
          </Link>
          .
        </p>
      </div>
    );
  }
  if (page.total === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No assessments yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link
            href="/staff/assessments/new"
            className="underline underline-offset-4"
          >
            Set an assessment
          </Link>{" "}
          for a module, and the students registered on it can submit work.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableCaption className="sr-only">
          Assessments matching the search and filters
        </TableCaption>
        <TableHeader>
          <TableRow>
            <Sortable query={query} column="title" label="Assessment" />
            <Sortable query={query} column="module" label="Module" />
            <Sortable query={query} column="deadline" label="Deadline" />
            <Sortable query={query} column="state" label="State" />
            <Sortable query={query} column="submitted" label="Submitted" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((assessment) => (
            <TableRow key={assessment.id}>
              <TableCell className="min-w-48 whitespace-normal">
                <Link
                  href={`/staff/assessments/${assessment.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {assessment.title}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {assessment.academicYear} ·{" "}
                  {SEMESTER_LABELS[assessment.module.semester]}
                </div>
              </TableCell>
              <TableCell className="min-w-48 whitespace-normal">
                <span className="font-mono text-xs">
                  {assessment.module.code}
                </span>{" "}
                {assessment.module.title}
              </TableCell>
              <TableCell>
                {formatDateTime(assessment.deadline, timeZone)}
              </TableCell>
              <TableCell>
                <AssessmentStateBadge state={assessment.state} />
              </TableCell>
              <TableCell className="tabular-nums">
                {assessment.submittedCount} of {assessment.expectedCount}
                {assessment.lateCount > 0 && (
                  <div className="text-xs text-red-900">
                    {assessment.lateCount} late
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        page={page}
        noun="assessment"
        hrefFor={(number) => assessmentListHref({ ...query, page: number })}
      />
    </>
  );
}

/** A heading that sorts the list by its column, or reverses the order. */
function Sortable({
  query,
  column,
  label,
}: {
  query: AssessmentListQuery;
  column: AssessmentSort;
  label: string;
}) {
  // By state, open first, unless the address says otherwise.
  const sort = query.sort ?? "state";
  const dir = query.dir ?? "asc";
  const active = sort === column;
  const next = active && dir === "asc" ? "desc" : "asc";
  return (
    <SortableHead
      label={label}
      direction={active ? dir : undefined}
      // A new order starts again at the first page.
      href={assessmentListHref({
        ...query,
        sort: column,
        dir: next,
        page: undefined,
      })}
    />
  );
}

/**
 * The list's address with these settings. The usual order (by state, open
 * first) and the first page are left out, so addresses stay short.
 */
function assessmentListHref(query: AssessmentListQuery): string {
  const usual = (query.sort ?? "state") === "state" && query.dir !== "desc";
  return listHref("/staff/assessments", {
    q: query.q,
    state: query.state,
    year: query.year,
    sort: usual ? undefined : query.sort,
    dir: usual ? undefined : query.dir,
    page: query.page && query.page > 1 ? query.page : undefined,
  });
}
