// A student's record, as Registry staff see it: details, status history,
// sign-in account, fees and results, with the controls to edit details,
// change status, manage sign-in, charge fees and record payments.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { HistoryCard } from "@/components/activity/history-card";
import { AccountSection } from "@/components/fees/account-section";
import { ResultsSection } from "@/components/results/results-section";
import { PageHeader } from "@/components/page-header";
import { SignInCard } from "@/components/students/sign-in-card";
import { StatusBadge } from "@/components/status-badge";
import { StatusChangeForm } from "@/components/students/status-change-form";
import {
  StatusHistoryCard,
  StudentDetailsCard,
} from "@/components/students/student-details";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { academicYearOn, academicYearsAround } from "@/domain/academic-year";
import { formatDateOf, formatDateTime } from "@/lib/format";
import { ENROLMENT_STATUS_LABELS } from "@/domain/enrolment";
import { collegeTimeZone, collegeToday } from "@/server/college";
import { orNotFound } from "@/server/pages";
import { getStudentHistory } from "@/server/services/activity";
import { getAccount } from "@/server/services/fees";
import { getResults } from "@/server/services/results";
import { getStudentSignIn } from "@/server/services/sign-in";
import { getStudent } from "@/server/services/students";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Student record" };

type Params = PageProps<"/staff/students/[studentNumber]">["params"];

export default function StudentPage({
  params,
}: PageProps<"/staff/students/[studentNumber]">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-6">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <StudentRecordView params={params} />
    </Suspense>
  );
}

async function StudentRecordView({ params }: { params: Params }) {
  const session = await requirePageRole("staff");
  const { studentNumber } = await params;
  const [student, account, results, signIn, history] = await orNotFound(
    Promise.all([
      getStudent(session, studentNumber),
      getAccount(session, studentNumber),
      getResults(session, studentNumber),
      getStudentSignIn(session, studentNumber),
      getStudentHistory(session, studentNumber),
    ]),
  );
  const timeZone = collegeTimeZone();
  const today = collegeToday();
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
        description={`${student.programme.title} · ${student.academicYear}`}
        actions={
          <Link
            href={`/staff/students/${student.studentNumber}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            Edit details
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <StudentDetailsCard
          student={student}
          today={today}
          timeZone={timeZone}
        />
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Change status</h2>
              </CardTitle>
              <CardDescription>
                Currently {ENROLMENT_STATUS_LABELS[student.status]}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Remount after a change, so the form offers the new options. */}
              <StatusChangeForm
                key={student.status}
                studentNumber={student.studentNumber}
                allowed={student.allowedStatusChanges}
              />
            </CardContent>
          </Card>
          <SignInCard
            studentNumber={student.studentNumber}
            fullName={student.fullName}
            signIn={{
              email: signIn.email,
              state: signIn.state,
              activatedOn:
                signIn.activatedAt &&
                formatDateOf(signIn.activatedAt, timeZone),
              disabledOn:
                signIn.disabledAt && formatDateOf(signIn.disabledAt, timeZone),
              link: signIn.link && {
                sentAt: formatDateTime(signIn.link.sentAt, timeZone),
                expiresAt: formatDateTime(signIn.link.expiresAt, timeZone),
              },
              devices: signIn.devices,
            }}
          />
          <StatusHistoryCard student={student} timeZone={timeZone} />
        </div>
      </div>
      <AccountSection
        account={account}
        timeZone={timeZone}
        staff={{
          today,
          academicYears: [
            ...new Set([
              ...academicYearsAround(academicYearOn(today), 2, 1),
              student.academicYear,
            ]),
          ].sort(),
        }}
      />
      <ResultsSection
        results={results}
        fullName={student.fullName}
        account={account}
        timeZone={timeZone}
      />
      <HistoryCard entries={history} timeZone={timeZone} />
    </>
  );
}
