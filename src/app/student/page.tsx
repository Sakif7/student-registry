// The student's home page: their own record, read-only.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  StatusHistoryCard,
  StudentDetailsCard,
} from "@/components/students/student-details";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { EnrolmentStatus } from "@/domain/enrolment";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { collegeToday, getStudent } from "@/server/services/students";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My record" };

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
          <Skeleton className="h-64" />
        </div>
      }
    >
      <MyRecord />
    </Suspense>
  );
}

async function MyRecord() {
  const session = await requirePageRole("student");
  const student = await getStudent(session, session.studentNumber).catch(
    (error: unknown) => {
      // The record may have gone (e.g. the demo data was reset): choose again.
      if (error instanceof AppError && error.kind === "NOT_FOUND")
        redirect("/");
      throw error;
    },
  );
  const note = STATUS_NOTES[student.status];
  const timeZone = env().APP_TIME_ZONE;
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
      />
      {note && (
        <Alert className="mb-6">
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <StudentDetailsCard
          student={student}
          today={collegeToday()}
          timeZone={timeZone}
        />
        <StatusHistoryCard student={student} timeZone={timeZone} />
      </div>
    </>
  );
}
