// The assessments with marks waiting to be published, each with a button to
// publish its marks to all its students at once, as a registry releases a
// cohort's marks together.
import Link from "next/link";

import { PublishMarksButton } from "@/components/assessments/publish-marks-button";
import { Pagination } from "@/components/lists/pagination";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ListPage } from "@/domain/lists";
import type { ResultsListQuery } from "@/domain/results";
import { formatCount, formatDateTime } from "@/lib/format";
import type { AssessmentToPublish } from "@/server/services/results";

import { resultsListHref } from "./results-list-href";

export function AssessmentsToPublish({
  page,
  query,
  timeZone,
}: {
  page: ListPage<AssessmentToPublish>;
  /** The page's settings, of both its lists. */
  query: ResultsListQuery;
  timeZone: string;
}) {
  if (page.total === 0) {
    return (
      <p className="text-muted-foreground">
        {query.aq
          ? `No assessment with marks to publish matches “${query.aq}”.`
          : "No assessment has marks waiting to be published."}
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableCaption className="sr-only">
          Assessments with marks waiting to be published, the longest waiting
          first
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Assessment</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Waiting</TableHead>
            <TableHead>Publish</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="min-w-48 whitespace-normal">
                <Link
                  href={`/staff/assessments/${item.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {item.title}
                </Link>
                <div className="pt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{item.module.code}</span>{" "}
                  {item.module.title}
                </div>
              </TableCell>
              <TableCell>{formatDateTime(item.deadline, timeZone)}</TableCell>
              <TableCell className="tabular-nums">
                {formatCount(item.waitingCount, "mark")}
                {item.withheldCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    and {item.withheldCount} withheld
                  </div>
                )}
              </TableCell>
              <TableCell>
                <PublishMarksButton
                  assessmentId={item.id}
                  title={item.title}
                  waitingCount={item.waitingCount}
                  withheldCount={item.withheldCount}
                  size="sm"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        page={page}
        noun="assessment"
        label="Pages of assessments"
        hrefFor={(number) => resultsListHref({ ...query, apage: number })}
      />
    </>
  );
}
