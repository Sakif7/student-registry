// A student's record, as Registry staff see it: a header with where the
// student stands and the main actions, then a tab for each part of the
// record: details, modules, fees, assessments, results, history and
// sign-in. The tab in the address (?tab=) opens first.
import type { Metadata } from "next";
import { Suspense } from "react";

import { HistoryCard } from "@/components/activity/history-card";
import { AccountSection } from "@/components/fees/account-section";
import { PageHeader } from "@/components/page-header";
import { RecordTabs } from "@/components/record-tabs";
import { ModulesSection } from "@/components/registration/modules-section";
import { ResultsSection } from "@/components/results/results-section";
import {
  ChangeStatusDialog,
  EditDetailsDialog,
} from "@/components/students/record-actions";
import { RecordSummary } from "@/components/students/record-summary";
import { SignInCard } from "@/components/students/sign-in-card";
import {
  StatusHistoryCard,
  StudentDetailsCard,
} from "@/components/students/student-details";
import { StudentAssessmentsTable } from "@/components/submissions/student-assessments-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  academicYearEnded,
  academicYearOn,
  recordYears,
  returnYears,
} from "@/domain/academic-year";
import { formatDateOf, formatDateTime } from "@/lib/format";
import { collegeTimeZone, collegeToday } from "@/server/college";
import { firstValues, orNotFound } from "@/server/pages";
import { getStudentHistory } from "@/server/services/activity";
import { getAccount } from "@/server/services/fees";
import { getStudentModules } from "@/server/services/registrations";
import { getResults } from "@/server/services/results";
import { getStudentSignIn } from "@/server/services/sign-in";
import { getStudent, listProgrammes } from "@/server/services/students";
import { listStudentAssessments } from "@/server/services/submissions";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Student record" };

type Props = PageProps<"/staff/students/[studentNumber]">;

export default function StudentPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-6">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <StudentRecordView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StudentRecordView({ params, searchParams }: Props) {
  const session = await requirePageRole("staff");
  const { studentNumber } = await params;
  const { tab } = firstValues(await searchParams);
  const [
    student,
    modules,
    account,
    results,
    signIn,
    history,
    assessments,
    programmes,
  ] = await orNotFound(
    Promise.all([
      getStudent(session, studentNumber),
      getStudentModules(session, studentNumber),
      getAccount(session, studentNumber),
      getResults(session, studentNumber),
      getStudentSignIn(session, studentNumber),
      getStudentHistory(session, studentNumber),
      listStudentAssessments(session, studentNumber),
      listProgrammes(session),
    ]),
  );
  const timeZone = collegeTimeZone();
  const today = collegeToday();
  // The years staff can choose, plus the student's own, which may be older.
  const academicYears = [
    ...new Set([...recordYears(today), student.academicYear]),
  ].sort();
  // A deferred or withdrawn student returns in this year or next: their own
  // if it hasn't ended, as its modules would be history.
  const returning = student.allowedStatusChanges.includes("ENROLLED")
    ? {
        academicYears: returnYears(today),
        academicYear: academicYearEnded(student.academicYear, today)
          ? academicYearOn(today)
          : student.academicYear,
        yearOfStudy: student.yearOfStudy,
        years: student.programme.years,
        signInOff: signIn.disabledAt !== null,
      }
    : undefined;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Students", href: "/staff/students" }]}
        eyebrow={<span className="font-mono">{student.studentNumber}</span>}
        title={student.fullName}
        description={`${student.programme.title} · Year ${student.yearOfStudy} · ${student.academicYear}`}
        actions={
          <>
            <EditDetailsDialog
              studentNumber={student.studentNumber}
              details={{
                fullName: student.fullName,
                email: student.email,
                dateOfBirth: student.dateOfBirth,
                programmeCode: student.programme.code,
                academicYear: student.academicYear,
                yearOfStudy: student.yearOfStudy,
              }}
              programmes={programmes}
              academicYears={academicYears}
              today={today}
              fixedPlacement={student.status === "COMPLETED"}
            />
            <ChangeStatusDialog
              studentNumber={student.studentNumber}
              status={student.status}
              allowed={student.allowedStatusChanges}
              returning={returning}
            />
          </>
        }
      />

      {/* Keyed by the tab asked for, so a link to another tab of this record
          opens it even though the page stays mounted. */}
      <RecordTabs
        key={tab ?? ""}
        initialTab={tab}
        header={
          <RecordSummary
            student={student}
            modules={modules}
            account={account}
            results={results}
            signIn={signIn}
            timeZone={timeZone}
          />
        }
        tabs={[
          {
            value: "overview",
            label: "Overview",
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <StudentDetailsCard
                  student={student}
                  today={today}
                  timeZone={timeZone}
                />
                <StatusHistoryCard student={student} timeZone={timeZone} />
              </div>
            ),
          },
          {
            value: "modules",
            label: "Modules",
            content: <ModulesSection modules={modules} viewer="staff" />,
          },
          {
            value: "fees",
            label: "Fees",
            content: (
              <AccountSection
                account={account}
                timeZone={timeZone}
                staff={{ today, academicYears }}
              />
            ),
          },
          {
            value: "assessments",
            label: "Assessments",
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>Assessments</h2>
                  </CardTitle>
                  <CardDescription>
                    Work set for the student&apos;s modules, and what they have
                    submitted.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StudentAssessmentsTable
                    assessments={assessments}
                    timeZone={timeZone}
                    viewer="staff"
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "results",
            label: "Results",
            content: (
              <ResultsSection
                results={results}
                fullName={student.fullName}
                account={account}
                timeZone={timeZone}
              />
            ),
          },
          {
            value: "history",
            label: "History",
            content: <HistoryCard entries={history} timeZone={timeZone} />,
          },
          {
            value: "sign-in",
            label: "Sign-in",
            content: (
              <div className="max-w-2xl">
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
                      signIn.disabledAt &&
                      formatDateOf(signIn.disabledAt, timeZone),
                    link: signIn.link && {
                      sentAt: formatDateTime(signIn.link.sentAt, timeZone),
                      expiresAt: formatDateTime(
                        signIn.link.expiresAt,
                        timeZone,
                      ),
                    },
                    devices: signIn.devices,
                  }}
                />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
