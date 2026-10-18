// A student's marks, for staff (every mark, with whether it is published) or
// for the student (published marks only, as the server sends them).
import Link from "next/link";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLASSIFICATION_LABELS } from "@/domain/results";
import { formatDateOf } from "@/lib/format";
import type { StudentResult } from "@/server/services/results";

export function ResultsTable({
  results,
  timeZone,
  staff = false,
}: {
  results: StudentResult[];
  timeZone: string;
  /** Link to the assessments and show which marks are published. */
  staff?: boolean;
}) {
  return (
    <Table>
      <TableCaption className="sr-only">
        Results, latest assessment first
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Assessment</TableHead>
          <TableHead>Year</TableHead>
          <TableHead className="text-right">Mark</TableHead>
          <TableHead>Result</TableHead>
          {staff && <TableHead>Published</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.assessment.id}>
            <TableCell className="min-w-48 whitespace-normal">
              {staff ? (
                <Link
                  href={`/staff/assessments/${result.assessment.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {result.assessment.title}
                </Link>
              ) : (
                <span className="font-medium">{result.assessment.title}</span>
              )}
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{result.module.code}</span>{" "}
                {result.module.title}
              </div>
            </TableCell>
            {/* Tells apart the marks of a module taken twice. */}
            <TableCell className="tabular-nums">
              {result.academicYear}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {result.mark}
            </TableCell>
            <TableCell>
              {CLASSIFICATION_LABELS[result.classification]}
            </TableCell>
            {staff && (
              <TableCell className="text-muted-foreground">
                {result.publishedAt
                  ? formatDateOf(result.publishedAt, timeZone)
                  : "Not published"}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
