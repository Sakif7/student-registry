// One assessment: a summary of its deadline, whether it takes work, and the
// work in; the controls to change it; and its marksheet of submissions and
// marks.
import { CalendarClock, ClipboardCheck, FileCheck, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ClosureControl } from "@/components/assessments/closure-control";
import { EditAssessmentDialog } from "@/components/assessments/edit-assessment-dialog";
import {
  Marksheet,
  type MarksheetRow,
} from "@/components/assessments/marksheet";
import { PageHeader } from "@/components/page-header";
import { type SummaryFact, SummaryStrip } from "@/components/summary-strip";
import type { Tone } from "@/components/tone";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CalendarDate,
  daysBetween,
  instantToWallTime,
} from "@/domain/college-time";
import { SEMESTER_LABELS } from "@/domain/curriculum";
import {
  ASSESSMENT_STATE_LABELS,
  type AssessmentState,
} from "@/domain/submissions";
import {
  formatCount,
  formatDateOf,
  formatDateTime,
  formatDaysAway,
  formatFileSize,
} from "@/lib/format";
import { collegeTimeZone, collegeToday } from "@/server/college";
import { orNotFound } from "@/server/pages";
import {
  type AssessmentDetail,
  getAssessment,
} from "@/server/services/assessments";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Assessment" };

const STATE_TONES: Record<AssessmentState, Tone> = {
  OPEN: "positive",
  ACCEPTING_LATE: "attention",
  CLOSED: "neutral",
};

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
        eyebrow={
          <>
            <span className="font-mono">{assessment.module.code}</span>{" "}
            {assessment.module.title} ·{" "}
            <span className="whitespace-nowrap">
              {assessment.academicYear} ·{" "}
              {SEMESTER_LABELS[assessment.module.semester]}
            </span>
          </>
        }
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
        <SummaryStrip
          facts={summaryFacts(assessment, collegeToday(), timeZone)}
        />

        <section aria-label="Submissions and marks">
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            Submissions and marks
          </h2>
          {assessment.students.length === 0 ? (
            <p className="text-muted-foreground">
              No enrolled student is registered on {assessment.module.code} for{" "}
              {assessment.academicYear} yet.
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

/**
 * The assessment at a glance: its deadline, whether it takes work, how many
 * of the students registered on its module have submitted, and the marks.
 */
function summaryFacts(
  assessment: AssessmentDetail,
  today: CalendarDate,
  timeZone: string,
): SummaryFact[] {
  const { submittedCount, expectedCount, lateCount } = assessment;
  const dueOn = instantToWallTime(assessment.deadline, timeZone).slice(0, 10);
  const away = formatDaysAway(daysBetween(today, dueOn));
  const marks = assessment.students.flatMap(({ result }) =>
    result ? [result] : [],
  );
  const published = marks.filter(({ publishedAt }) => publishedAt).length;
  return [
    {
      label: "Deadline",
      icon: CalendarClock,
      value: formatDateTime(assessment.deadline, timeZone),
      detail: away.charAt(0).toUpperCase() + away.slice(1),
    },
    {
      label: "Submissions",
      icon: Inbox,
      value: ASSESSMENT_STATE_LABELS[assessment.state],
      tone: STATE_TONES[assessment.state],
      detail: stateNote(assessment, timeZone),
    },
    {
      label: "Submitted",
      icon: FileCheck,
      value: `${submittedCount} of ${formatCount(expectedCount, "student")}`,
      progress: { value: submittedCount, max: expectedCount },
      detail:
        submittedCount === 0
          ? "Nothing submitted yet"
          : lateCount > 0
            ? `${lateCount} late`
            : "All on time",
    },
    {
      label: "Marked",
      icon: ClipboardCheck,
      value: formatCount(marks.length, "mark"),
      detail:
        marks.length === 0
          ? "None entered yet"
          : published === marks.length
            ? "All published"
            : `${published} published`,
    },
  ];
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
      return "Taking work, which can be replaced, until the deadline";
    case "ACCEPTING_LATE":
      return "Taking late work until you close it";
    case "CLOSED":
      return assessment.closedAt
        ? `Closed on ${formatDateOf(assessment.closedAt, timeZone)}`
        : "No longer taking work";
  }
}
