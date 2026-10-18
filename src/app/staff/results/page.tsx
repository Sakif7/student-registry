// Results: the assessments with marks waiting to be published, each of which
// can be published to all its students at once, then every student with
// marks or withheld results, those with marks waiting first.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { AssessmentsToPublish } from "@/components/results/assessments-to-publish";
import { ResultsWorklist } from "@/components/results/results-worklist";
import { Skeleton } from "@/components/ui/skeleton";
import { collegeTimeZone } from "@/server/college";
import {
  listAssessmentsToPublish,
  listResultsWorklist,
} from "@/server/services/results";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Results" };

export default function ResultsPage() {
  return (
    <>
      <PageHeader
        title="Results"
        description="Students see their marks only once you publish them. Publish an assessment's marks to all its students at once, or one student's marks, here. Open a student's record to withhold their results."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Worklists />
      </Suspense>
    </>
  );
}

async function Worklists() {
  const session = await requirePageRole("staff");
  const [assessments, students] = await Promise.all([
    listAssessmentsToPublish(session),
    listResultsWorklist(session),
  ]);
  return (
    <div className="grid grid-cols-1 gap-8">
      <section aria-label="Assessments with marks to publish">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          Assessments with marks to publish
        </h2>
        <AssessmentsToPublish
          items={assessments}
          timeZone={collegeTimeZone()}
        />
      </section>
      <section aria-label="Students with marks">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          Students with marks
        </h2>
        <ResultsWorklist items={students} />
      </section>
    </div>
  );
}
