// A student's record, as Registry staff see it.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  StatusHistoryCard,
  StudentDetailsCard,
} from "@/components/students/student-details";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/server/env";
import { orNotFound } from "@/server/pages";
import { collegeToday, getStudent } from "@/server/services/students";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Student record" };

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

async function StudentRecordView({
  params,
}: {
  params: PageProps<"/staff/students/[studentNumber]">["params"];
}) {
  const session = await requirePageRole("staff");
  const { studentNumber } = await params;
  const student = await orNotFound(getStudent(session, studentNumber));
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
