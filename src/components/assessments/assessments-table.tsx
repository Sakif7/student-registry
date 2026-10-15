// Every assessment, with its deadline, state and how many of the students
// expected to submit have done so.
import Link from "next/link";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { AssessmentSummary } from "@/server/services/assessments";

import { AssessmentStateBadge } from "./assessment-badges";

export function AssessmentsTable({
  assessments,
  timeZone,
}: {
  assessments: AssessmentSummary[];
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
      <TableCaption className="sr-only">
        Assessments, open ones first by deadline
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Assessment</TableHead>
          <TableHead>Programme</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Submitted</TableHead>
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
