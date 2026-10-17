// Enrol a student. The student ID is allocated when the record is saved.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";
import { Skeleton } from "@/components/ui/skeleton";
import { academicYearOn, academicYearsAround } from "@/domain/academic-year";
import { DEMO_INBOX_URL, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { collegeToday } from "@/server/college";
import { env } from "@/server/env";
import { listProgrammes } from "@/server/services/students";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Enrol a student" };

export default function NewStudentPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Students", href: "/staff/students" }]}
        title="Enrol a student"
        description="Create a student record. The student ID is allocated when you save, in the form SMS-year-number."
      />
      <Suspense fallback={<Skeleton className="h-96 max-w-xl" />}>
        <NewStudentForm />
      </Suspense>
    </>
  );
}

async function NewStudentForm() {
  const session = await requirePageRole("staff");
  const programmes = await listProgrammes(session);
  const today = collegeToday();
  const currentYear = academicYearOn(today);
  return (
    <StudentForm
      mode="create"
      programmes={programmes}
      academicYears={academicYearsAround(currentYear, 1, 1)}
      defaultAcademicYear={currentYear}
      today={today}
      // In the demo, a new student can sign in at once with the demo
      // password, and emails are read in Mailpit.
      demo={
        env().SHOW_DEMO_ACCOUNTS
          ? { password: DEMO_PASSWORD, inboxUrl: DEMO_INBOX_URL }
          : undefined
      }
    />
  );
}
