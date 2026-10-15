// The student's assessments, with what they have submitted for each.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { StudentAssessmentsTable } from "@/components/submissions/student-assessments-table";
import { Skeleton } from "@/components/ui/skeleton";
import { collegeTimeZone } from "@/server/college";
import { orNotFound } from "@/server/pages";
import { listStudentAssessments } from "@/server/services/submissions";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My assessments" };

export default function MyAssessmentsPage() {
  return (
    <>
      <PageHeader
        title="My assessments"
        description="Submit a PDF or Word document for each assessment. You can replace your work until the deadline."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <MyAssessments />
      </Suspense>
    </>
  );
}

async function MyAssessments() {
  const session = await requirePageRole("student");
  const assessments = await orNotFound(
    listStudentAssessments(session, session.studentNumber),
  );
  return (
    <StudentAssessmentsTable
      assessments={assessments}
      timeZone={collegeTimeZone()}
    />
  );
}
