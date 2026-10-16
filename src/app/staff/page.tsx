// Registry dashboard: the staff home page. Headline figures; students by
// programme and status; the academic year's fees; what needs attention
// (marks to publish, work to mark, assessments past their deadline,
// accounts waiting for activation and options still to choose); the
// overdue worklist; the assessments open for submissions; and the year's
// marks.
import {
  Banknote,
  ClipboardCheck,
  GraduationCap,
  KeyRound,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  DashboardCard,
  DashboardGroup,
  EmptyNote,
} from "@/components/dashboard/dashboard-card";
import { FeesChart } from "@/components/dashboard/fees-chart";
import { Figures } from "@/components/dashboard/figures";
import { MarksChart } from "@/components/dashboard/marks-chart";
import { OpenAssessments } from "@/components/dashboard/open-assessments";
import { OverdueTable } from "@/components/dashboard/overdue-table";
import { ProgrammeChart } from "@/components/dashboard/programme-chart";
import { Worklist } from "@/components/dashboard/worklist";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount, formatDateOf, formatMoney } from "@/lib/format";
import { collegeTimeZone } from "@/server/college";
import { getDashboard } from "@/server/services/dashboard";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Registry dashboard" };

export default function StaffDashboardPage() {
  return (
    <>
      <PageHeader
        title="Registry dashboard"
        actions={
          <Link href="/staff/students/new" className={buttonVariants()}>
            Enrol a student
          </Link>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const session = await requirePageRole("staff");
  const dashboard = await getDashboard(session);
  const timeZone = collegeTimeZone();
  const {
    academicYear,
    fees,
    results,
    workToMark,
    pastDeadline,
    awaitingActivation,
    creditsToChoose,
  } = dashboard;
  const marksToPublish = results.toPublish.reduce(
    (total, student) => total + student.count,
    0,
  );
  const unmarked = workToMark.reduce(
    (total, assessment) => total + assessment.unmarked,
    0,
  );
  const needLink = awaitingActivation.filter(({ link }) => !link).length;
  const yearMarks = Object.values(dashboard.marks).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-1 gap-6">
      <Figures
        figures={[
          {
            label: "Enrolled students",
            value: String(dashboard.statusCounts.ENROLLED),
            detail: `${dashboard.totalStudents} on record`,
            icon: Users,
          },
          {
            label: "Overdue fees",
            value: formatMoney(dashboard.totalOverduePence),
            detail: `${formatCount(dashboard.overdueAccounts.length, "student")} past the due date`,
            icon: TriangleAlert,
          },
          {
            label: `Collected for ${academicYear}`,
            value: formatMoney(fees.paidPence),
            detail: `of ${formatMoney(fees.chargedPence)} charged`,
            icon: Banknote,
          },
          {
            label: "Marks to publish",
            value: String(marksToPublish),
            detail:
              results.withheld > 0
                ? `${formatCount(results.toPublish.length, "student")}; ${results.withheld} held`
                : formatCount(results.toPublish.length, "student"),
            icon: GraduationCap,
          },
          {
            label: "Work to mark",
            value: String(unmarked),
            detail:
              unmarked > 0
                ? `In ${formatCount(workToMark.length, "assessment")}`
                : "All marked",
            icon: ClipboardCheck,
          },
          {
            label: "Waiting for activation",
            value: String(awaitingActivation.length),
            detail:
              needLink > 0
                ? `${needLink} without a working link`
                : awaitingActivation.length > 0
                  ? "Every link still works"
                  : "Everyone has activated",
            icon: KeyRound,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <DashboardCard
          title="Students by programme"
          description="By enrolment status. Select a status or a programme for its students."
          link={{ href: "/staff/students", label: "All students" }}
          className="xl:col-span-3"
        >
          {dashboard.programmes.length > 0 ? (
            <ProgrammeChart
              programmes={dashboard.programmes}
              statusCounts={dashboard.statusCounts}
            />
          ) : (
            <EmptyNote>No programmes yet.</EmptyNote>
          )}
        </DashboardCard>
        <DashboardCard
          title={`Fees for ${academicYear}`}
          description="Payments clear each student's oldest charges first."
          className="xl:col-span-2"
        >
          {fees.chargedPence > 0 ? (
            <FeesChart fees={fees} />
          ) : (
            <EmptyNote>No fees charged for {academicYear} yet.</EmptyNote>
          )}
        </DashboardCard>
      </div>

      <DashboardGroup title="Needs attention">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DashboardCard
            level={3}
            title="Marks to publish"
            count={results.toPublish.length}
            description="Students whose marks aren't published, longest waiting first."
            link={{ href: "/staff/results", label: "Results" }}
          >
            <Worklist
              empty="No marks are waiting to be published."
              items={results.toPublish.map((student) => ({
                key: student.studentNumber,
                href: `/staff/students/${student.studentNumber}?tab=results`,
                label: student.fullName,
                detail: `${formatCount(student.count, "mark")}, waiting since ${formatDateOf(student.waitingSince, timeZone)}`,
              }))}
            />
          </DashboardCard>
          <DashboardCard
            level={3}
            title="Work to mark"
            count={workToMark.length}
            description="Submissions without a mark, once the deadline has passed."
            link={{ href: "/staff/assessments", label: "Assessments" }}
          >
            <Worklist
              empty="All work past its deadline is marked."
              items={workToMark.map((assessment) => ({
                key: assessment.assessmentId,
                href: `/staff/assessments/${assessment.assessmentId}`,
                label: assessment.title,
                detail: `${assessment.moduleCode} · ${formatCount(assessment.unmarked, "submission")} to mark`,
              }))}
            />
          </DashboardCard>
          <DashboardCard
            level={3}
            title="Past the deadline"
            count={pastDeadline.length}
            description="Still taking late work. Close each one when late work should stop."
            link={{ href: "/staff/assessments", label: "Assessments" }}
          >
            <Worklist
              empty="No open assessment is past its deadline."
              items={pastDeadline.map((assessment) => ({
                key: assessment.id,
                href: `/staff/assessments/${assessment.id}`,
                label: assessment.title,
                detail: `${assessment.module.code} · deadline ${formatDateOf(assessment.deadline, timeZone)}`,
              }))}
            />
          </DashboardCard>
          <DashboardCard
            level={3}
            title="Waiting for activation"
            count={awaitingActivation.length}
            description="Enrolled students who haven't set a password. Their Sign-in tab sends a new link."
          >
            <Worklist
              empty="Every enrolled student has activated their account."
              items={awaitingActivation.map((student) => ({
                key: student.studentNumber,
                href: `/staff/students/${student.studentNumber}?tab=sign-in`,
                label: student.fullName,
                detail: student.link
                  ? `Link works until ${formatDateOf(student.link.expiresAt, timeZone)}`
                  : "Needs a new link",
              }))}
            />
          </DashboardCard>
          <DashboardCard
            level={3}
            title="Options to choose"
            count={creditsToChoose.length}
            description="Enrolled students whose modules don't yet make up their year's credits."
          >
            <Worklist
              empty="Every enrolled student's modules make up their year."
              items={creditsToChoose.map((student) => ({
                key: student.studentNumber,
                href: `/staff/students/${student.studentNumber}?tab=modules`,
                label: student.fullName,
                detail: `${student.creditsLeft} credits to choose · ${student.programmeCode} year ${student.yearOfStudy}`,
              }))}
            />
          </DashboardCard>
        </div>
      </DashboardGroup>

      <DashboardCard
        title="Overdue fees"
        count={dashboard.overdueAccounts.length}
        description="Fees still unpaid after their due date, longest overdue first. Withdrawn and completed students are included: their debts still need chasing."
      >
        <OverdueTable
          accounts={dashboard.overdueAccounts}
          totalPence={dashboard.totalOverduePence}
        />
      </DashboardCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardCard
          title="Open assessments"
          count={dashboard.openAssessments.length}
          description="Taking submissions, soonest deadline first."
          link={{ href: "/staff/assessments", label: "All assessments" }}
        >
          {dashboard.openAssessments.length > 0 ? (
            <OpenAssessments
              assessments={dashboard.openAssessments}
              timeZone={timeZone}
            />
          ) : (
            <EmptyNote>No assessment is open for submissions.</EmptyNote>
          )}
        </DashboardCard>
        <DashboardCard
          title={`Marks for ${academicYear}`}
          description="By classification, published or not, for the assessments due this academic year."
        >
          {yearMarks > 0 ? (
            <MarksChart marks={dashboard.marks} />
          ) : (
            <EmptyNote>No marks for {academicYear} yet.</EmptyNote>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Skeleton className="h-80 rounded-xl xl:col-span-3" />
        <Skeleton className="h-80 rounded-xl xl:col-span-2" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
