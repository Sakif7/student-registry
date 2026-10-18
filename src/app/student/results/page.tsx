// The student's results: published marks only, as the server sends them, or
// the reason their results are withheld. 20 to a page, with a search and a
// classification kept in the address.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { listHref } from "@/components/lists/list-params";
import { Pagination } from "@/components/lists/pagination";
import { PageHeader } from "@/components/page-header";
import { StudentResultsFilterBar } from "@/components/results/results-filters";
import { ResultsTable } from "@/components/results/results-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { paginate } from "@/domain/lists";
import {
  CLASSIFICATION_BOUNDARIES,
  filterStudentResults,
  studentResultsListSchema,
} from "@/domain/results";
import { collegeTimeZone } from "@/server/college";
import { firstValues, orNotFound } from "@/server/pages";
import { getResults } from "@/server/services/results";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My results" };

export default function MyResultsPage({
  searchParams,
}: PageProps<"/student/results">) {
  const { PASS, MERIT, DISTINCTION } = CLASSIFICATION_BOUNDARIES;
  return (
    <>
      <PageHeader
        title="My results"
        description={`Marks appear here once the Registry publishes them. Pass from ${PASS}, Merit from ${MERIT}, Distinction from ${DISTINCTION}.`}
      />
      <Suspense fallback={<Skeleton className="h-48" />}>
        <MyResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MyResults({
  searchParams,
}: {
  searchParams: PageProps<"/student/results">["searchParams"];
}) {
  const session = await requirePageRole("student");
  const query = studentResultsListSchema.parse(firstValues(await searchParams));
  const { withheld, results } = await orNotFound(
    getResults(session, session.studentNumber),
  );
  if (withheld) {
    return (
      <Alert variant="warning" className="max-w-prose">
        <AlertTitle>Your results are being withheld</AlertTitle>
        <AlertDescription>
          Reason: {withheld.reason}. Contact the Registry to resolve this, and
          your results will appear here once the hold is lifted.
        </AlertDescription>
      </Alert>
    );
  }
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No results yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your marks will appear here once they are published.
        </p>
      </div>
    );
  }
  const page = paginate(filterStudentResults(results, query), query.page);
  return (
    <>
      <StudentResultsFilterBar
        // Remount when the classification changes, so the select shows it;
        // the search box keeps its own text while you type.
        key={query.result ?? ""}
        query={query}
      />
      {page.total === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No results match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a shorter search, or{" "}
            <Link
              href="/student/results"
              className="underline underline-offset-4"
            >
              clear the filters
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <ResultsTable results={page.items} timeZone={collegeTimeZone()} />
          <Pagination
            page={page}
            noun="result"
            hrefFor={(number) =>
              listHref("/student/results", {
                q: query.q,
                result: query.result,
                page: number > 1 ? number : undefined,
              })
            }
          />
        </>
      )}
    </>
  );
}
