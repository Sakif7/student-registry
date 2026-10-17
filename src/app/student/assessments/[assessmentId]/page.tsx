// One assessment as the student sees it: the deadline, their submitted work,
// and the form to submit or replace it.
import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AssessmentStateBadge,
  LateBadge,
} from "@/components/assessments/assessment-badges";
import { PageHeader } from "@/components/page-header";
import { UploadForm } from "@/components/submissions/upload-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { collegeTimeZone } from "@/server/college";
import { orNotFound } from "@/server/pages";
import {
  getStudentAssessment,
  type StudentAssessment,
} from "@/server/services/submissions";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Assessment" };

type Params = PageProps<"/student/assessments/[assessmentId]">["params"];

export default function MyAssessmentPage({
  params,
}: PageProps<"/student/assessments/[assessmentId]">) {
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
  const session = await requirePageRole("student");
  const { assessmentId } = await params;
  const assessment = await orNotFound(
    getStudentAssessment(session, assessmentId),
  );
  const timeZone = collegeTimeZone();
  const { submission, upload } = assessment;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Assessments", href: "/student/assessments" }]}
        eyebrow={
          <>
            <span className="font-mono">{assessment.module.code}</span>{" "}
            {assessment.module.title}
          </>
        }
        title={assessment.title}
      />
      <div className="grid gap-6 lg:grid-cols-2">
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
            <p className="text-muted-foreground">{deadlineNote(assessment)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your submission</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submission ? (
              <div className="grid gap-1">
                <a
                  href={`/api/submissions/${submission.id}/file`}
                  className="w-fit font-medium wrap-anywhere underline underline-offset-4"
                >
                  <span className="sr-only">Download </span>
                  {submission.fileName}
                </a>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(submission.sizeBytes)}
                </p>
                <p className="flex flex-wrap items-center gap-2">
                  Submitted{" "}
                  {formatDateTime(submission.submittedAt, timeZone, {
                    seconds: true,
                  })}
                  {submission.late && <LateBadge />}
                </p>
                {submission.attempt > 1 && (
                  <p className="text-sm text-muted-foreground">
                    This is your {ordinal(submission.attempt)} upload. Only the
                    latest file is kept.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                You haven&apos;t submitted any work yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {upload.allowed ? (
        // As wide as a column of the grid above, so its edges line up.
        <Card className="mt-6 lg:w-[calc(50%-0.75rem)]">
          <CardHeader>
            <CardTitle>
              <h2>
                {upload.resubmission ? "Replace your work" : "Submit your work"}
              </h2>
            </CardTitle>
            {upload.resubmission && (
              <CardDescription>
                The new file replaces the one you submitted.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            {upload.late && (
              <Alert variant="warning">
                <AlertTitle>The deadline has passed</AlertTitle>
                <AlertDescription>
                  You can still submit, but your work will be marked late, and
                  you won&apos;t be able to replace it afterwards.
                </AlertDescription>
              </Alert>
            )}
            <UploadForm
              assessmentId={assessment.id}
              resubmission={upload.resubmission}
            />
          </CardContent>
        </Card>
      ) : (
        // Closed and past-deadline assessments are explained under Deadline.
        upload.reason !== "CLOSED" &&
        upload.reason !== "DEADLINE_PASSED" && (
          <Alert className="mt-6 lg:w-[calc(50%-0.75rem)]">
            <AlertDescription>{upload.message}</AlertDescription>
          </Alert>
        )
      )}
    </>
  );
}

/**
 * What the deadline means for the student now. It only promises what the
 * student may actually do: one who can't submit (e.g. while deferred) is told
 * why in the upload section instead.
 */
function deadlineNote(assessment: StudentAssessment): string {
  const canUpload = assessment.upload.allowed;
  switch (assessment.state) {
    case "OPEN":
      return canUpload
        ? "You can submit, and replace your work, until the deadline. Work submitted after it is marked late."
        : "Open for submissions until the deadline.";
    case "ACCEPTING_LATE":
      if (assessment.submission) {
        return "The deadline has passed, so your work can no longer be replaced.";
      }
      return canUpload
        ? "The deadline has passed. You can still submit, but your work will be marked late."
        : "The deadline has passed.";
    case "CLOSED":
      return "This assessment is closed to submissions.";
  }
}

const ORDINAL_SUFFIXES: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };

/** 2 → "2nd", 3 → "3rd", 11 → "11th". */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : (ORDINAL_SUFFIXES[n % 10] ?? "th")}`;
}
