// Students by programme: a bar for each programme, split by enrolment status
// and scaled to the largest programme. The bars are plain HTML rather than a
// chart library's, because programme titles are too long for a chart's axis.
// Each bar's figures are written under it, so colour is never the only cue,
// and the legend's entries open the student list filtered to that status.
import { cn } from "cn";
import Link from "next/link";

import {
  ENROLMENT_STATUS_LABELS,
  ENROLMENT_STATUSES,
  type EnrolmentStatus,
} from "@/domain/enrolment";
import type { ProgrammeStudents } from "@/server/services/dashboard";

const SWATCHES: Record<EnrolmentStatus, string> = {
  ENROLLED: "bg-chart-enrolled",
  DEFERRED: "bg-chart-deferred",
  WITHDRAWN: "bg-chart-withdrawn",
  COMPLETED: "bg-chart-completed",
};

export function ProgrammeChart({
  programmes,
  statusCounts,
}: {
  programmes: readonly ProgrammeStudents[];
  statusCounts: Record<EnrolmentStatus, number>;
}) {
  const totals = programmes.map(({ counts }) => totalOf(counts));
  const largest = Math.max(1, ...totals);
  return (
    <div className="grid gap-5">
      <ul
        aria-label="Students by status"
        className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
      >
        {ENROLMENT_STATUSES.map((status) => (
          <li key={status}>
            <Link
              href={`/staff/students?status=${status}`}
              className="inline-flex items-center gap-1.5 rounded-sm underline-offset-4 hover:underline"
            >
              <span
                aria-hidden
                className={cn("size-2.5 rounded-[3px]", SWATCHES[status])}
              />
              {ENROLMENT_STATUS_LABELS[status]}
              <span className="font-medium tabular-nums">
                {statusCounts[status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <ul className="grid gap-4">
        {programmes.map((programme, index) => {
          const total = totals[index] ?? 0;
          return (
            <li key={programme.code} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link
                  href={`/staff/students?programme=${encodeURIComponent(programme.code)}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {programme.title}
                </Link>
                <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {total === 1 ? "1 student" : `${total} students`}
                </span>
              </div>
              <div aria-hidden className="h-3 rounded-full bg-muted">
                <div
                  className="flex h-full overflow-hidden rounded-full [&>*+*]:border-l-2 [&>*+*]:border-card"
                  style={{ width: `${(total / largest) * 100}%` }}
                >
                  {ENROLMENT_STATUSES.filter(
                    (status) => programme.counts[status] > 0,
                  ).map((status) => (
                    <div
                      key={status}
                      title={`${ENROLMENT_STATUS_LABELS[status]}: ${programme.counts[status]}`}
                      className={SWATCHES[status]}
                      style={{
                        width: `${(programme.counts[status] / total) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {breakdown(programme.counts)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function totalOf(counts: Record<EnrolmentStatus, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

/** E.g. "5 enrolled · 1 deferred". */
function breakdown(counts: Record<EnrolmentStatus, number>): string {
  const parts = ENROLMENT_STATUSES.filter((status) => counts[status] > 0).map(
    (status) =>
      `${counts[status]} ${ENROLMENT_STATUS_LABELS[status].toLowerCase()}`,
  );
  return parts.length > 0 ? parts.join(" · ") : "No students";
}
