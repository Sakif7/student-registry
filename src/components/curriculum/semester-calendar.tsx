// An academic year's two semesters, with their dates.
import type { SemesterDates } from "@/domain/curriculum";
import { formatDate } from "@/lib/format";

export function SemesterCalendar({
  academicYear,
  calendar,
}: {
  academicYear: string;
  /** Null while staff haven't set the year up. */
  calendar: SemesterDates | null;
}) {
  if (!calendar) {
    return (
      <p className="text-sm text-muted-foreground">
        The semester dates for {academicYear} aren&apos;t set yet.
      </p>
    );
  }
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground">Semester 1</dt>
        <dd>
          <span className="whitespace-nowrap">
            {formatDate(calendar.semester1Start)}
          </span>{" "}
          to{" "}
          <span className="whitespace-nowrap">
            {formatDate(calendar.semester1End)}
          </span>
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Semester 2</dt>
        <dd>
          <span className="whitespace-nowrap">
            {formatDate(calendar.semester2Start)}
          </span>{" "}
          to{" "}
          <span className="whitespace-nowrap">
            {formatDate(calendar.semester2End)}
          </span>
        </dd>
      </div>
    </dl>
  );
}
