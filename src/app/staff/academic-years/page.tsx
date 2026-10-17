// The academic calendar: each academic year's two semesters, and whether
// students may choose their own optional modules. The current year is
// marked, and the next one can be set up ahead of time.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AcademicYearDialog } from "@/components/curriculum/curriculum-dialogs";
import { SemesterCalendar } from "@/components/curriculum/semester-calendar";
import { StudentsChooseButton } from "@/components/curriculum/students-choose-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  academicYearOn,
  formatAcademicYear,
  startYearOf,
} from "@/domain/academic-year";
import { collegeToday } from "@/server/college";
import {
  type AcademicYearCalendar,
  listAcademicYears,
} from "@/server/services/curriculum";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Academic years" };

export default function AcademicYearsPage() {
  return (
    <>
      <PageHeader
        title="Academic years"
        description="Each year's semester dates, and whether students choose their own optional modules. A year runs from 1 September to 31 August."
        actions={
          <Suspense fallback={<Skeleton className="h-8 w-36" />}>
            <SetUpNextYear />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <AcademicYears />
      </Suspense>
    </>
  );
}

/** Sets up the next academic year, in the header as other pages' actions are. */
async function SetUpNextYear() {
  const session = await requirePageRole("staff");
  const years = await listAcademicYears(session);
  return <AcademicYearDialog year={nextToSetUp(years)} />;
}

/** This year if it isn't set up yet, or else the year after the latest. */
function nextToSetUp(years: readonly AcademicYearCalendar[]): string {
  const current = academicYearOn(collegeToday());
  if (!years.some(({ year }) => year === current)) return current;
  const latest = Math.max(
    startYearOf(current) - 1,
    ...years.map(({ year }) => startYearOf(year)),
  );
  return formatAcademicYear(latest + 1);
}

async function AcademicYears() {
  const session = await requirePageRole("staff");
  const years = await listAcademicYears(session);
  const current = academicYearOn(collegeToday());

  return (
    <div className="grid grid-cols-1 gap-6">
      {years.map((calendar) => (
        <YearCard
          key={calendar.year}
          calendar={calendar}
          current={calendar.year === current}
        />
      ))}
    </div>
  );
}

function YearCard({
  calendar,
  current,
}: {
  calendar: AcademicYearCalendar;
  current: boolean;
}) {
  const { year, ...settings } = calendar;
  return (
    <Card>
      {/* Centred, so the year and its Edit button share a midline. */}
      <CardHeader className="items-center">
        <CardTitle className="flex items-center gap-2">
          <h2>{year}</h2>
          {current && <Badge variant="secondary">Current</Badge>}
        </CardTitle>
        {/* One row, not shadcn's two, which set the button below centre. */}
        <CardAction className="row-span-1 self-center">
          <AcademicYearDialog year={year} calendar={settings} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SemesterCalendar academicYear={year} calendar={settings} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <p>
            {calendar.studentsChooseModules
              ? "Students choose their own optional modules."
              : "Only the Registry changes students' modules."}
          </p>
          <StudentsChooseButton
            year={year}
            choosing={calendar.studentsChooseModules}
          />
        </div>
      </CardContent>
    </Card>
  );
}
