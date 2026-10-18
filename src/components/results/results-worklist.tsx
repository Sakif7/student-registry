// Every student with marks or a hold on their results, with their fees, so
// staff can publish marks that are ready and see whose results are withheld.
import Link from "next/link";

import { StandingBadge } from "@/components/fees/standing-badge";
import { Pagination } from "@/components/lists/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { formatMoney } from "@/lib/format";
import type { ResultsWorklistItem } from "@/server/services/results";

import { PublishResultsButton } from "./publish-results-button";
import { resultsListHref } from "./results-list-href";

export function ResultsWorklist({
  page,
  query,
}: {
  page: ListPage<ResultsWorklistItem>;
  /** The page's settings, of both its lists. */
  query: ResultsListQuery;
}) {
  if (page.total === 0 && (query.q || query.show)) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No students match these filters.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a shorter search, or{" "}
          <Link
            href={resultsListHref({ aq: query.aq, apage: query.apage })}
            className="underline underline-offset-4"
          >
            clear the filters
          </Link>
          .
        </p>
      </div>
    );
  }
  if (page.total === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No marks yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter marks on an assessment&apos;s marksheet, and students with marks
          will be listed here.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableCaption className="sr-only">
          Students with marks, those with marks to publish first
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Fees</TableHead>
            <TableHead>Marks</TableHead>
            <TableHead>Results</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((item) => (
            <TableRow key={item.studentNumber}>
              <TableCell>
                <Link
                  href={`/staff/students/${item.studentNumber}?tab=results`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {item.fullName}
                </Link>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.studentNumber}
                  </span>
                  {item.status !== "ENROLLED" && (
                    <StatusBadge status={item.status} />
                  )}
                </div>
              </TableCell>
              <TableCell>
                <StandingBadge standing={item.account.standing} />
                {item.account.overduePence > 0 && (
                  <div className="text-xs text-red-900">
                    {formatMoney(item.account.overduePence)} overdue
                  </div>
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {item.publishedCount} published
                {item.unpublishedCount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {item.unpublishedCount} not published
                  </div>
                )}
              </TableCell>
              <TableCell className="min-w-40 whitespace-normal">
                {item.withheld ? (
                  <>
                    <Badge className="border-transparent bg-amber-100 text-amber-900">
                      Withheld
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {item.withheld.reason}
                    </div>
                  </>
                ) : item.unpublishedCount > 0 ? (
                  <PublishResultsButton
                    studentNumber={item.studentNumber}
                    fullName={item.fullName}
                    unpublishedCount={item.unpublishedCount}
                    size="sm"
                  />
                ) : (
                  <span className="text-muted-foreground">All published</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        page={page}
        noun="student"
        label="Pages of students"
        hrefFor={(number) => resultsListHref({ ...query, page: number })}
      />
    </>
  );
}
