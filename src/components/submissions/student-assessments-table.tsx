// A student's assessments: deadlines, and what they have submitted for each.
// The student sees their own; staff see a student's on the student's record.
import Link from "next/link";

import {
  AssessmentStateBadge,
  LateBadge,
} from "@/components/assessments/assessment-badges";
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
import type { StudentAssessment } from "@/server/services/submissions";

export function StudentAssessmentsTable({
  assessments,
  timeZone,
  viewer = "student",
}: {
  assessments: StudentAssessment[];
  timeZone: string;
  /** Who is looking: links go to that view's assessment pages. */
  viewer?: "student" | "staff";
}) {
  const own = viewer === "student";
  if (assessments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No assessments yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Assessments set for {own ? "your" : "the student's"} programme will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableCaption className="sr-only">
        {own ? "Your" : "The student's"} assessments, open ones first by
        deadline
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Assessment</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead>State</TableHead>
          <TableHead>{own ? "Your work" : "Work"}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assessments.map((assessment) => (
          <TableRow key={assessment.id}>
            <TableCell className="min-w-48 whitespace-normal">
              <Link
                href={`/${viewer}/assessments/${assessment.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {assessment.title}
              </Link>
              <div className="text-xs text-muted-foreground">
                {assessment.module.code} {assessment.module.title}
              </div>
            </TableCell>
            <TableCell>
              {formatDateTime(assessment.deadline, timeZone)}
            </TableCell>
            <TableCell>
              <AssessmentStateBadge state={assessment.state} />
            </TableCell>
            <TableCell>
              {assessment.submission ? (
                <span className="flex items-center gap-2">
                  Submitted
                  {assessment.submission.late && <LateBadge />}
                </span>
              ) : (
                <span className="text-muted-foreground">Not submitted</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
