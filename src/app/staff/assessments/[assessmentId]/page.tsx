// One assessment: its deadline and state, the controls to change them, and
// who has submitted.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AssessmentStateBadge } from "@/components/assessments/assessment-badges";
import { ClosureControl } from "@/components/assessments/closure-control";
import { EditAssessmentDialog } from "@/components/assessments/edit-assessment-dialog";
import { SubmissionTracker } from "@/components/assessments/submission-tracker";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { instantToWallTime } from "@/domain/college-time";
import { formatDateTime } from "@/lib/format";
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
      <div className="grid gap-8">
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

        <section aria-labelledby="submissions-heading">
          <h2
            id="submissions-heading"
            className="mb-3 text-xl font-semibold tracking-tight"
          >
            Submissions
          </h2>
          <SubmissionTracker assessment={assessment} timeZone={timeZone} />
        </section>
      </div>
    </>
  );
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
