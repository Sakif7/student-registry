// Students: search, filter and page through student records.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { StudentFilterBar } from "@/components/students/student-filters";
import { StudentTable } from "@/components/students/student-table";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { academicYearOn, academicYearsAround } from "@/domain/academic-year";
import { studentFiltersSchema } from "@/domain/students";
import { collegeToday } from "@/server/college";
import { firstValues } from "@/server/pages";
import { listProgrammes, listStudents } from "@/server/services/students";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Students" };

type SearchParams = PageProps<"/staff/students">["searchParams"];

export default function StudentsPage({
  searchParams,
}: PageProps<"/staff/students">) {
  return (
    <>
      <PageHeader
        title="Students"
        description="Search by name, student ID or email, and filter by programme, status and academic year."
        actions={
          <Link href="/staff/students/new" className={buttonVariants()}>
            Enrol a student
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="mb-6 h-14" />}>
        <Filters searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Filters({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePageRole("staff");
  const params = firstValues(await searchParams);
  const programmes = await listProgrammes(session);
  const currentYear = academicYearOn(collegeToday());
  return (
    // Remount when the URL changes, so the fields show the applied filters.
    <StudentFilterBar
      key={new URLSearchParams(params).toString()}
      filters={studentFiltersSchema.parse(params)}
      programmes={programmes}
      academicYears={academicYearsAround(currentYear, 3, 1)}
    />
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePageRole("staff");
  const page = await listStudents(session, firstValues(await searchParams));
  return <StudentTable page={page} />;
}
