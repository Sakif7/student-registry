// The student's home page: where they stand at a glance (their next
// deadline, fees and latest results), then every assessment still taking
// work. While they have options to choose, it says so first. Their details
// are on My record, and their account on Fees.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  DashboardCard,
  EmptyNote,
} from "@/components/dashboard/dashboard-card";
import { FeesSummary } from "@/components/home/fees-summary";
import { LatestResults } from "@/components/home/latest-results";
import { NextDeadline } from "@/components/home/next-deadline";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StudentAssessmentsTable } from "@/components/submissions/student-assessments-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { EnrolmentStatus } from "@/domain/enrolment";
import { formatPlacement } from "@/lib/format";
import { collegeTimeZone } from "@/server/college";
import { orNotFound } from "@/server/pages";
import { getAccount } from "@/server/services/fees";
import { getStudentModules } from "@/server/services/registrations";
import { getResults } from "@/server/services/results";
import { getStudent } from "@/server/services/students";
import { listStudentAssessments } from "@/server/services/submissions";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Home" };

/** What each status means for the student, in their own words. */
const STATUS_NOTES: Partial<Record<EnrolmentStatus, string>> = {
  DEFERRED:
    "Your enrolment is deferred, so you can't submit work until you return. You can still see your fees and any published results.",
  WITHDRAWN:
    "You have withdrawn. You can still see your fees and any published results; contact the Registry about returning.",
  COMPLETED:
    "You have completed your programme. You can still see your fees and your published results.",
};

export default function StudentHomePage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-6">
          <Skeleton className="h-12 w-72" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      }
    >
      <Home />
    </Suspense>
  );
}

async function Home() {
  const session = await requirePageRole("student");
  const [student, modules, account, assessments, results] = await orNotFound(
    Promise.all([
      getStudent(session, session.studentNumber),
      getStudentModules(session, session.studentNumber),
      getAccount(session, session.studentNumber),
      listStudentAssessments(session, session.studentNumber),
      getResults(session, session.studentNumber),
    ]),
  );
  const creditsLeft = modules.creditsPerYear - modules.registeredCredits;
  const timeZone = collegeTimeZone();
  const note = STATUS_NOTES[student.status];
  // Open ones first, soonest deadline first (see compareAssessments).
  const takingWork = assessments.filter(({ state }) => state !== "CLOSED");
  const next = assessments.find(({ state }) => state === "OPEN");

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <span className="font-mono">{student.studentNumber}</span>
            <StatusBadge status={student.status} />
          </span>
        }
        title={student.fullName}
        description={`${student.programme.title} · ${formatPlacement(student)}`}
      />
      {note && (
        <Alert
          variant={student.status === "COMPLETED" ? "default" : "warning"}
          className="mb-6"
        >
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}
      {modules.changes.allowed && creditsLeft > 0 && (
        <Alert className="mb-6">
          <AlertTitle>Choose your options</AlertTitle>
          <AlertDescription>
            <p>
              Choosing modules is open. You have {creditsLeft} credits to choose
              for {modules.academicYear}.{" "}
              <Link
                href="/student/modules"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Choose your modules
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <DashboardCard title="Next deadline">
            <NextDeadline
              assessment={next}
              now={new Date()}
              timeZone={timeZone}
            />
          </DashboardCard>
          <DashboardCard
            title="Fees"
            link={{ href: "/student/fees", label: "Your fees" }}
          >
            <FeesSummary account={account} />
          </DashboardCard>
          <DashboardCard
            title="Latest results"
            link={{ href: "/student/results", label: "All results" }}
          >
            <LatestResults results={results} timeZone={timeZone} />
          </DashboardCard>
        </div>
        <DashboardCard
          title="Assessments taking work"
          count={takingWork.length}
          description="Open ones first, soonest deadline first. After the deadline, late work is accepted until the assessment closes."
          link={{ href: "/student/assessments", label: "All assessments" }}
        >
          {takingWork.length > 0 ? (
            <StudentAssessmentsTable
              assessments={takingWork}
              timeZone={timeZone}
            />
          ) : (
            <EmptyNote>No assessment is taking work just now.</EmptyNote>
          )}
        </DashboardCard>
      </div>
    </>
  );
}
