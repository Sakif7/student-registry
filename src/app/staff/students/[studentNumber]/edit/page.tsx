// Edit a student's details. Status changes are made on the record page.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";
import { Skeleton } from "@/components/ui/skeleton";
import { academicYearOn, academicYearsAround } from "@/domain/academic-year";
import { collegeToday } from "@/server/college";
import { orNotFound } from "@/server/pages";
import { getStudent, listProgrammes } from "@/server/services/students";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Edit student" };

type Params = PageProps<"/staff/students/[studentNumber]/edit">["params"];

export default function EditStudentPage({
  params,
}: PageProps<"/staff/students/[studentNumber]/edit">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 max-w-xl" />}>
      <EditStudent params={params} />
    </Suspense>
  );
}

async function EditStudent({ params }: { params: Params }) {
  const session = await requirePageRole("staff");
  const { studentNumber } = await params;
  const student = await orNotFound(getStudent(session, studentNumber));
  const programmes = await listProgrammes(session);
  const today = collegeToday();
  // Offer the usual range plus the student's own year, which may be older.
  const academicYears = [
    ...new Set([
      ...academicYearsAround(academicYearOn(today), 3, 1),
      student.academicYear,
    ]),
  ].sort();

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Students", href: "/staff/students" },
          {
            label: student.fullName,
            href: `/staff/students/${student.studentNumber}`,
          },
        ]}
        eyebrow={<span className="font-mono">{student.studentNumber}</span>}
        title={`Edit ${student.fullName}`}
        description="The student ID stays the same, even if you change the academic year or programme."
      />
      <StudentForm
        mode="edit"
        studentNumber={student.studentNumber}
        programmes={programmes}
        academicYears={academicYears}
        today={today}
        defaultValues={{
          fullName: student.fullName,
          email: student.email,
          dateOfBirth: student.dateOfBirth,
          programmeCode: student.programme.code,
          academicYear: student.academicYear,
        }}
      />
    </>
  );
}
