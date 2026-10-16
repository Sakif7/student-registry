// A student's record, as Registry staff see it: a header with where the
// student stands and the main actions, then a tab for each part of the
// record: details, fees, assessments, results, history and sign-in. The tab
// in the address (?tab=) opens first.
import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";

import { HistoryCard } from "@/components/activity/history-card";
import { AccountSection } from "@/components/fees/account-section";
import { StandingBadge } from "@/components/fees/standing-badge";
import { PageHeader } from "@/components/page-header";
import { RecordTabs } from "@/components/record-tabs";
import { ResultsSection } from "@/components/results/results-section";
import { StatusBadge } from "@/components/status-badge";
import {
  ChangeStatusDialog,
  EditDetailsDialog,
} from "@/components/students/record-actions";
import { SignInBadge } from "@/components/students/sign-in-badge";
import { SignInCard } from "@/components/students/sign-in-card";
import {
  StatusHistoryCard,
  StudentDetailsCard,
} from "@/components/students/student-details";
import { StudentAssessmentsTable } from "@/components/submissions/student-assessments-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { academicYearOn, academicYearsAround } from "@/domain/academic-year";
import { formatDateOf, formatDateTime, formatMoney } from "@/lib/format";
import { collegeTimeZone, collegeToday } from "@/server/college";
import { firstValues, orNotFound } from "@/server/pages";
import { getStudentHistory } from "@/server/services/activity";
import { getAccount } from "@/server/services/fees";
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
          <Skeleton className="h-9 w-full max-w-xl" />
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
  const [student, account, results, signIn, history, assessments, programmes] =
    await orNotFound(
      Promise.all([
        getStudent(session, studentNumber),
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
  // The usual range of years, plus the student's own, which may be older.
  const yearsAround = (before: number) =>
    [
      ...new Set([
        ...academicYearsAround(academicYearOn(today), before, 1),
        student.academicYear,
      ]),
    ].sort();
  const unpublished = results.results.filter((r) => !r.publishedAt).length;
  const overdue = account.summary.overduePence;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Students", href: "/staff/students" }]}
        eyebrow={<span className="font-mono">{student.studentNumber}</span>}
        title={student.fullName}
        description={`${student.programme.title} · ${student.academicYear}`}
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
              }}
              programmes={programmes}
              academicYears={yearsAround(3)}
              today={today}
            />
            <ChangeStatusDialog
              studentNumber={student.studentNumber}
              status={student.status}
              allowed={student.allowedStatusChanges}
            />
          </>
        }
      />

      <dl className="mb-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Fact label="Status">
          <StatusBadge status={student.status} />
        </Fact>
        <Fact label="Fees">
          <StandingBadge standing={account.standing} />
          {overdue > 0 && (
            <span className="text-red-900">{formatMoney(overdue)} overdue</span>
          )}
        </Fact>
        <Fact label="Results">
          {results.withheld ? (
            <Badge className="border-transparent bg-amber-100 text-amber-900">
              Withheld
            </Badge>
          ) : unpublished > 0 ? (
            <span>{unpublished} to publish</span>
          ) : results.results.length > 0 ? (
            <span>All published</span>
          ) : (
            <span className="text-muted-foreground">None yet</span>
          )}
        </Fact>
        <Fact label="Sign-in">
          <SignInBadge state={signIn.state} />
        </Fact>
      </dl>

      <RecordTabs
        initialTab={tab}
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
            value: "fees",
            label: "Fees",
            content: (
              <AccountSection
                account={account}
                timeZone={timeZone}
                staff={{ today, academicYears: yearsAround(2) }}
              />
            ),
          },
          {
            value: "assessments",
            label: "Assessments",
            content: (
              <StudentAssessmentsTable
                assessments={assessments}
                timeZone={timeZone}
                viewer="staff"
              />
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

/** One of the facts under the record's title. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2">{children}</dd>
    </div>
  );
}
