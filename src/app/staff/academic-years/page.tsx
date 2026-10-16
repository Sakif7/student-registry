// The academic calendar: each academic year's two semesters, and whether
// students may choose their own optional modules. The current year is
// marked, and the next one can be set up ahead of time.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AcademicYearDialog } from "@/components/curriculum/curriculum-dialogs";
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
import { formatDate } from "@/lib/format";
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
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <AcademicYears />
      </Suspense>
    </>
  );
}

async function AcademicYears() {
  const session = await requirePageRole("staff");
  const years = await listAcademicYears(session);
  const current = academicYearOn(collegeToday());
  const setUp = new Set(years.map(({ year }) => year));
  // This year if it isn't set up yet, or else the year after the latest.
  const latest = Math.max(
    startYearOf(current) - 1,
    ...years.map(({ year }) => startYearOf(year)),
  );
  const next = setUp.has(current) ? formatAcademicYear(latest + 1) : current;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <AcademicYearDialog year={next} />
      </div>
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <h2>{year}</h2>
          {current && <Badge variant="secondary">Current</Badge>}
        </CardTitle>
        <CardAction>
          <AcademicYearDialog year={year} calendar={settings} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Semester 1</dt>
            <dd>
              {formatDate(calendar.semester1Start)} to{" "}
              {formatDate(calendar.semester1End)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Semester 2</dt>
            <dd>
              {formatDate(calendar.semester2Start)} to{" "}
              {formatDate(calendar.semester2End)}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <p>
            {calendar.studentsChooseModules
              ? "Students choose their own optional modules."
              : "Only the Registry changes students' modules."}
          </p>
          <StudentsChooseButton year={year} calendar={settings} />
        </div>
      </CardContent>
    </Card>
  );
}
