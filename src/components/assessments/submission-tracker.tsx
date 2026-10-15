// Who has submitted work for an assessment: every student enrolled on the
// programme, plus anyone else who submitted, with late work flagged.
import Link from "next/link";

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
import { formatDateTime, formatFileSize } from "@/lib/format";
import type { AssessmentDetail } from "@/server/services/assessments";

import { LateBadge } from "./assessment-badges";

export function SubmissionTracker({
  assessment,
  timeZone,
}: {
  assessment: AssessmentDetail;
  timeZone: string;
}) {
  const { students, expectedCount, submittedCount, lateCount } = assessment;
  if (students.length === 0) {
    return (
      <p className="text-muted-foreground">
        No students are enrolled on {assessment.programme.title} yet.
      </p>
    );
  }

  return (
    <>
      <p className="mb-3">
        {submittedCount} of {expectedCount} enrolled{" "}
        {expectedCount === 1 ? "student has" : "students have"} submitted
        {lateCount > 0 && `, ${lateCount} late`}.
      </p>
      <Table>
        <TableCaption className="sr-only">
          Submissions for {assessment.title}, by student
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead>File</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map(({ submission, ...student }) => (
            <TableRow key={student.studentNumber}>
              <TableCell>
                <Link
                  href={`/staff/students/${student.studentNumber}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {student.fullName}
                </Link>
                <div className="font-mono text-xs text-muted-foreground">
                  {student.studentNumber}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={student.status} />
              </TableCell>
              {submission ? (
                <>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {formatDateTime(submission.submittedAt, timeZone)}
                      {submission.late && <LateBadge />}
                    </span>
                    {submission.attempt > 1 && (
                      <div className="text-xs text-muted-foreground">
                        Replaced {submission.attempt - 1}{" "}
                        {submission.attempt === 2 ? "time" : "times"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    <span className="break-all">{submission.fileName}</span>
                    <div className="text-xs text-muted-foreground">
                      {formatFileSize(submission.sizeBytes)}
                    </div>
                  </TableCell>
                </>
              ) : (
                <TableCell colSpan={2} className="text-muted-foreground">
                  Not submitted
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
