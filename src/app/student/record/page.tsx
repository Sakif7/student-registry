// The student's own record, read-only: their details and the history of
// their enrolment status, as the Registry holds them.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import {
  StatusHistoryCard,
  StudentDetailsCard,
} from "@/components/students/student-details";
import { Skeleton } from "@/components/ui/skeleton";
import { collegeTimeZone, collegeToday } from "@/server/college";
import { orNotFound } from "@/server/pages";
import { getStudent } from "@/server/services/students";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My record" };

export default function MyRecordPage() {
  return (
    <>
      <PageHeader
        title="My record"
        description="Your details and enrolment history, as the Registry holds them. Contact the Registry to correct anything."
      />
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        <MyRecord />
      </Suspense>
    </>
  );
}

async function MyRecord() {
  const session = await requirePageRole("student");
  const student = await orNotFound(getStudent(session, session.studentNumber));
  const timeZone = collegeTimeZone();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <StudentDetailsCard
        student={student}
        today={collegeToday()}
        timeZone={timeZone}
      />
      <StatusHistoryCard student={student} timeZone={timeZone} />
    </div>
  );
}
