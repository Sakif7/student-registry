// One assessment: its deadline and state, the controls to change them, and
// its marksheet of submissions and marks.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AssessmentStateBadge } from "@/components/assessments/assessment-badges";
import { ClosureControl } from "@/components/assessments/closure-control";
import { EditAssessmentDialog } from "@/components/assessments/edit-assessment-dialog";
import {
  Marksheet,
  type MarksheetRow,
} from "@/components/assessments/marksheet";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { instantToWallTime } from "@/domain/college-time";
import { formatDateOf, formatDateTime, formatFileSize } from "@/lib/format";
import { collegeTimeZone } from "@/server/college";
import { orNotFound } from "@/server/pages";
import {
  type AssessmentDetail,
  getAssessment,
} from "@/server/services/assessments";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Assessment" };

type Params = PageProps<"/staff/assessments/[assessmentId]">["params"];

export default function AssessmentPage({
  params,
}: PageProps<"/staff/assessments/[assessmentId]">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-6">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <AssessmentView params={params} />
    </Suspense>
  );
}

async function AssessmentView({ params }: { params: Params }) {
  const session = await requirePageRole("staff");
  const { assessmentId } = await params;
  const assessment = await orNotFound(getAssessment(session, assessmentId));
  const timeZone = collegeTimeZone();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Assessments", href: "/staff/assessments" }]}
        eyebrow={`${assessment.module.code} ${assessment.module.title} · ${assessment.programme.title}`}
        title={assessment.title}
        actions={
          <>
            <EditAssessmentDialog
              assessmentId={assessment.id}
              title={assessment.title}
              deadline={instantToWallTime(assessment.deadline, timeZone)}
              timeZone={timeZone}
              now={instantToWallTime(new Date(), timeZone)}
            />
            <ClosureControl
              // Remount after a change, so the control shows the new state.
              key={String(assessment.closedAt)}
              assessmentId={assessment.id}
              closed={assessment.state === "CLOSED"}
            />
          </>
        }
      />
      <div className="grid grid-cols-1 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Deadline</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="flex flex-wrap items-center gap-2 text-base font-medium">
              {formatDateTime(assessment.deadline, timeZone)}
              <AssessmentStateBadge state={assessment.state} />
            </p>
            <p className="text-muted-foreground">
              {stateNote(assessment, timeZone)}
            </p>
          </CardContent>
        </Card>

        <section aria-label="Submissions and marks">
          <h2 className="text-xl font-semibold tracking-tight">
            Submissions and marks
          </h2>
          <p className="mt-1 mb-4">{submissionSummary(assessment)}</p>
          {assessment.students.length === 0 ? (
            <p className="text-muted-foreground">
              No students are enrolled on {assessment.programme.title} yet.
            </p>
          ) : (
            <Marksheet
              // Start again from the saved marks after each save.
              key={assessment.students
                .map((row) => `${row.studentNumber}:${row.result?.mark ?? ""}`)
                .join(" ")}
              assessmentId={assessment.id}
              title={assessment.title}
              rows={marksheetRows(assessment, timeZone)}
            />
          )}
        </section>
      </div>
    </>
  );
}

/** E.g. "2 of 7 enrolled students have submitted, 1 late." */
function submissionSummary(assessment: AssessmentDetail): string {
  const { submittedCount, expectedCount, lateCount } = assessment;
  const students = expectedCount === 1 ? "student has" : "students have";
  const late = lateCount > 0 ? `, ${lateCount} late` : "";
  return `${submittedCount} of ${expectedCount} enrolled ${students} submitted${late}.`;
}

/** The marksheet's rows, with dates and sizes formatted for display. */
function marksheetRows(
  assessment: AssessmentDetail,
  timeZone: string,
): MarksheetRow[] {
  return assessment.students.map(({ submission, result, ...student }) => ({
    ...student,
    submission: submission && {
      id: submission.id,
      fileName: submission.fileName,
      size: formatFileSize(submission.sizeBytes),
      submittedAt: formatDateTime(submission.submittedAt, timeZone),
      late: submission.late,
      replacedTimes: submission.attempt - 1,
    },
    mark: result?.mark ?? null,
    publishedOn: result?.publishedAt
      ? formatDateOf(result.publishedAt, timeZone)
      : null,
  }));
}

/** What the assessment's state means for students. */
function stateNote(assessment: AssessmentDetail, timeZone: string): string {
  switch (assessment.state) {
    case "OPEN":
      return "Students can submit, and replace their work, until the deadline.";
    case "ACCEPTING_LATE":
      return "The deadline has passed. Students who haven't submitted can still do so, marked late, until you close the assessment.";
    case "CLOSED":
      return assessment.closedAt
        ? `Closed to submissions on ${formatDateTime(assessment.closedAt, timeZone)}.`
        : "Closed to submissions.";
  }
}
