// Results: every student with marks or withheld results. Students with marks
// waiting to be published come first.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ResultsWorklist } from "@/components/results/results-worklist";
import { Skeleton } from "@/components/ui/skeleton";
import { listResultsWorklist } from "@/server/services/results";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Results" };

export default function ResultsPage() {
  return (
    <>
      <PageHeader
        title="Results"
        description="Students see their marks only once you publish them. Publish a student's marks here, or open their record to withhold their results."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Worklist />
      </Suspense>
    </>
  );
}

async function Worklist() {
  const session = await requirePageRole("staff");
  return <ResultsWorklist items={await listResultsWorklist(session)} />;
}
