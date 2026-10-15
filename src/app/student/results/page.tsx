// The student's results: published marks only, as the server sends them, or
// the reason their results are withheld.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ResultsTable } from "@/components/results/results-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CLASSIFICATION_BOUNDARIES } from "@/domain/results";
import { collegeTimeZone } from "@/server/college";
import { orNotFound } from "@/server/pages";
import { getResults } from "@/server/services/results";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My results" };

export default function MyResultsPage() {
  const { PASS, MERIT, DISTINCTION } = CLASSIFICATION_BOUNDARIES;
  return (
    <>
      <PageHeader
        title="My results"
        description={`Marks appear here once the Registry publishes them. Pass from ${PASS}, Merit from ${MERIT}, Distinction from ${DISTINCTION}.`}
      />
      <Suspense fallback={<Skeleton className="h-48" />}>
        <MyResults />
      </Suspense>
    </>
  );
}

async function MyResults() {
  const session = await requirePageRole("student");
  const { withheld, results } = await orNotFound(
    getResults(session, session.studentNumber),
  );
  if (withheld) {
    return (
      <Alert className="max-w-prose">
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
  return <ResultsTable results={results} timeZone={collegeTimeZone()} />;
}
