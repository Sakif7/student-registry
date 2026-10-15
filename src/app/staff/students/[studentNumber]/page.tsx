// A student's record, as Registry staff see it: details, status history and
// account, with the controls to edit details, change status, charge fees and
// record payments.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AccountSection } from "@/components/fees/account-section";
import { ResultsSection } from "@/components/results/results-section";
import { PageHeader } from "@/components/page-header";
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
import { ENROLMENT_STATUS_LABELS } from "@/domain/enrolment";
import { collegeTimeZone, collegeToday } from "@/server/college";
import { orNotFound } from "@/server/pages";
import { getAccount } from "@/server/services/fees";
import { getResults } from "@/server/services/results";
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
  const [student, account, results] = await orNotFound(
    Promise.all([
      getStudent(session, studentNumber),
      getAccount(session, studentNumber),
      getResults(session, studentNumber),
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
    </>
  );
}
