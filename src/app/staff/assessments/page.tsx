// Assessments: the work set for each module, open assessments first, 20 to
// a page. A search and filters narrow the list, the column headings sort
// it, and all of it stays in the address.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AssessmentFilterBar } from "@/components/assessments/assessment-filters";
import { AssessmentsTable } from "@/components/assessments/assessments-table";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { paginate } from "@/domain/lists";
import {
  assessmentListSchema,
  filterAssessments,
  sortAssessments,
} from "@/domain/submissions";
import { collegeTimeZone } from "@/server/college";
import { firstValues } from "@/server/pages";
import { listAssessments } from "@/server/services/assessments";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Assessments" };

type Props = PageProps<"/staff/assessments">;

export default function AssessmentsPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader
        title="Assessments"
        description="Work set for each module. Search by title or module, and filter by state and academic year. Open assessments come first, soonest deadline first; the column headings sort the list another way."
        actions={
          <Link href="/staff/assessments/new" className={buttonVariants()}>
            Set an assessment
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Assessments searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Assessments({ searchParams }: Pick<Props, "searchParams">) {
  const session = await requirePageRole("staff");
  const params = firstValues(await searchParams);
  const query = assessmentListSchema.parse(params);
  const assessments = await listAssessments(session);
  const academicYears = [
    ...new Set(assessments.map(({ academicYear }) => academicYear)),
  ].sort((a, b) => b.localeCompare(a));
  const page = paginate(
    sortAssessments(
      filterAssessments(assessments, query),
      query.sort,
      query.dir,
    ),
    query.page,
  );
  // Remount when the filters change, so the selects show the ones applied,
  // but not as the search does: the search box keeps its own text while
  // you type.
  const settled = new URLSearchParams(params);
  settled.delete("q");
  settled.delete("page");
  return (
    <>
      <AssessmentFilterBar
        key={settled.toString()}
        query={query}
        academicYears={academicYears}
      />
      <AssessmentsTable
        page={page}
        query={query}
        timeZone={collegeTimeZone()}
      />
    </>
  );
}
