// The assessments open for submissions, soonest deadline first, each with a
// bar for how many of the students expected to submit have done so. The
// figures are written under each bar too.
import Link from "next/link";

import { formatDateTime } from "@/lib/format";
import type { AssessmentSummary } from "@/server/services/assessments";

export function OpenAssessments({
  assessments,
  timeZone,
}: {
  assessments: readonly AssessmentSummary[];
  timeZone: string;
}) {
  return (
    <ul className="grid gap-4">
      {assessments.map((assessment) => {
        const { expectedCount, submittedCount } = assessment;
        const share = expectedCount > 0 ? submittedCount / expectedCount : 0;
        return (
          <li key={assessment.id} className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <Link
                href={`/staff/assessments/${assessment.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {assessment.title}
              </Link>
              <span className="text-xs text-muted-foreground">
                Due {formatDateTime(assessment.deadline, timeZone)}
              </span>
            </div>
            <div aria-hidden className="h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-chart-primary"
                style={{ width: `${share * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {assessment.module.code} · {submittedCount} of {expectedCount}{" "}
              submitted
            </p>
          </li>
        );
      })}
    </ul>
  );
}
