// Results: the assessments with marks waiting to be published, each of which
// can be published to all its students at once, then every student with
// marks or withheld results, those with marks waiting first. Each list has
// its own search and pages, kept in the address.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { AssessmentsToPublish } from "@/components/results/assessments-to-publish";
import {
  AssessmentsToPublishSearch,
  ResultsStudentFilters,
} from "@/components/results/results-filters";
import { ResultsWorklist } from "@/components/results/results-worklist";
import { Skeleton } from "@/components/ui/skeleton";
import { matchesSearch, paginate } from "@/domain/lists";
import { filterResultsStudents, resultsListSchema } from "@/domain/results";
import { collegeTimeZone } from "@/server/college";
import { firstValues } from "@/server/pages";
import {
  listAssessmentsToPublish,
  listResultsWorklist,
} from "@/server/services/results";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Results" };

export default function ResultsPage({
  searchParams,
}: PageProps<"/staff/results">) {
  return (
    <>
      <PageHeader
        title="Results"
        description="Students see their marks only once you publish them. Publish an assessment's marks to all its students at once, or one student's marks, here. Open a student's record to withhold their results."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Worklists searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Worklists({
  searchParams,
}: {
  searchParams: PageProps<"/staff/results">["searchParams"];
}) {
  const session = await requirePageRole("staff");
  const params = firstValues(await searchParams);
  const query = resultsListSchema.parse(params);
  const [assessments, students] = await Promise.all([
    listAssessmentsToPublish(session),
    listResultsWorklist(session),
  ]);
  const assessmentPage = paginate(
    assessments.filter((assessment) =>
      matchesSearch(query.aq, [
        assessment.title,
        assessment.module.code,
        assessment.module.title,
      ]),
    ),
    query.apage,
  );
  const studentPage = paginate(
    filterResultsStudents(students, query),
    query.page,
  );
  return (
    <div className="grid grid-cols-1 gap-8">
      <section aria-label="Assessments with marks to publish">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          Assessments with marks to publish
        </h2>
        <AssessmentsToPublishSearch query={query} />
        <AssessmentsToPublish
          page={assessmentPage}
          query={query}
          timeZone={collegeTimeZone()}
        />
      </section>
      <section aria-label="Students with marks">
        <h2 className="mb-4 text-xl font-semibold tracking-tight">
          Students with marks
        </h2>
        <ResultsStudentFilters
          // Remount when the filter changes, so the select shows it; the
          // search box keeps its own text while you type.
          key={query.show ?? ""}
          query={query}
        />
        <ResultsWorklist page={studentPage} query={query} />
      </section>
    </div>
  );
}
