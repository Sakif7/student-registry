// The student's next deadline: the soonest assessment still open, when it is
// due, and whether they have submitted for it.
import Link from "next/link";

import { EmptyNote } from "@/components/dashboard/dashboard-card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatDeadlineAway } from "@/lib/format";
import type { StudentAssessment } from "@/server/services/submissions";

export function NextDeadline({
  assessment,
  now,
  timeZone,
}: {
  /** The soonest open assessment, if any is open. */
  assessment: StudentAssessment | undefined;
  now: Date;
  timeZone: string;
}) {
  if (!assessment) {
    return <EmptyNote>No assessment is open for submissions.</EmptyNote>;
  }
  const { submission, upload } = assessment;
  return (
    <div className="grid gap-1.5">
      <Link
        href={`/student/assessments/${assessment.id}`}
        className="w-fit text-lg font-semibold underline-offset-4 hover:underline"
      >
        {assessment.title}
      </Link>
      <p className="text-sm text-muted-foreground">
        <span className="font-mono">{assessment.module.code}</span>{" "}
        {assessment.module.title}
      </p>
      <p className="text-sm">
        Due {formatDateTime(assessment.deadline, timeZone)}{" "}
        <span className="whitespace-nowrap">
          ({formatDeadlineAway(assessment.deadline, now, timeZone)})
        </span>
      </p>
      <p className="mt-1 text-sm">
        {submission ? (
          <Badge className="border-transparent bg-emerald-100 text-emerald-900">
            Submitted
          </Badge>
        ) : upload.allowed ? (
          <span className="text-muted-foreground">Not submitted yet.</span>
        ) : (
          <span className="text-muted-foreground">{upload.message}</span>
        )}
      </p>
    </div>
  );
}
