// Every assessment, with its deadline, state and how many of the students
// expected to submit have done so. Column headings sort the list.
import Link from "next/link";

import { SortableHead } from "@/components/sortable-head";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssessmentOrder, AssessmentSort } from "@/domain/submissions";
import { formatDateTime } from "@/lib/format";
import type { AssessmentSummary } from "@/server/services/assessments";

import { AssessmentStateBadge } from "./assessment-badges";

export function AssessmentsTable({
  assessments,
  order,
  timeZone,
}: {
  assessments: AssessmentSummary[];
  /** How the list is sorted now. */
  order: AssessmentOrder;
  timeZone: string;
}) {
  if (assessments.length === 0) {
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
          for a module, and students on its programme can submit work.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableCaption className="sr-only">Every assessment set</TableCaption>
      <TableHeader>
        <TableRow>
          <Sortable order={order} column="title" label="Assessment" />
          <Sortable order={order} column="programme" label="Programme" />
          <Sortable order={order} column="deadline" label="Deadline" />
          <Sortable order={order} column="state" label="State" />
          <Sortable order={order} column="submitted" label="Submitted" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {assessments.map((assessment) => (
          <TableRow key={assessment.id}>
            <TableCell className="min-w-48 whitespace-normal">
              <Link
                href={`/staff/assessments/${assessment.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {assessment.title}
              </Link>
              <div className="text-xs text-muted-foreground">
                {assessment.module.code} {assessment.module.title}
              </div>
            </TableCell>
            <TableCell className="min-w-36 whitespace-normal">
              {assessment.programme.title}
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
  );
}

/** A heading that sorts the list by its column, or reverses the order. */
function Sortable({
  order,
  column,
  label,
}: {
  order: AssessmentOrder;
  column: AssessmentSort;
  label: string;
}) {
  // By state, open first, unless the address says otherwise.
  const sort = order.sort ?? "state";
  const dir = order.dir ?? "asc";
  const active = sort === column;
  const next = active && dir === "asc" ? "desc" : "asc";
  return (
    <SortableHead
      label={label}
      direction={active ? dir : undefined}
      href={
        column === "state" && next === "asc"
          ? "/staff/assessments"
          : `/staff/assessments?sort=${column}&dir=${next}`
      }
    />
  );
}
