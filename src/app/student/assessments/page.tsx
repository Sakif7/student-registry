// The student's assessments, with what they have submitted for each, 20 to
// a page, with a search and a state kept in the address.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AssessmentFilterBar } from "@/components/assessments/assessment-filters";
import { listHref } from "@/components/lists/list-params";
import { Pagination } from "@/components/lists/pagination";
import { PageHeader } from "@/components/page-header";
import { StudentAssessmentsTable } from "@/components/submissions/student-assessments-table";
import { Skeleton } from "@/components/ui/skeleton";
import { paginate } from "@/domain/lists";
import {
  filterAssessments,
  studentAssessmentListSchema,
} from "@/domain/submissions";
import { collegeTimeZone } from "@/server/college";
import { firstValues, orNotFound } from "@/server/pages";
import { listStudentAssessments } from "@/server/services/submissions";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My assessments" };

export default function MyAssessmentsPage({
  searchParams,
}: PageProps<"/student/assessments">) {
  return (
    <>
      <PageHeader
        title="My assessments"
        description="Submit a PDF or Word document for each assessment. You can replace your work until the deadline."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <MyAssessments searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MyAssessments({
  searchParams,
}: {
  searchParams: PageProps<"/student/assessments">["searchParams"];
}) {
  const session = await requirePageRole("student");
  const params = firstValues(await searchParams);
  const query = studentAssessmentListSchema.parse(params);
  const assessments = await orNotFound(
    listStudentAssessments(session, session.studentNumber),
  );
  if (assessments.length === 0) {
    return (
      <StudentAssessmentsTable assessments={[]} timeZone={collegeTimeZone()} />
    );
  }
  const page = paginate(filterAssessments(assessments, query), query.page);
  return (
    <>
      <AssessmentFilterBar action="/student/assessments" query={query} />
      {page.total === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No assessments match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a shorter search, or{" "}
            <Link
              href="/student/assessments"
              className="underline underline-offset-4"
            >
              clear the filters
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <StudentAssessmentsTable
            assessments={page.items}
            timeZone={collegeTimeZone()}
          />
          <Pagination
            page={page}
            noun="assessment"
            hrefFor={(number) =>
              listHref("/student/assessments", {
                q: query.q,
                state: query.state,
                page: number > 1 ? number : undefined,
              })
            }
          />
        </>
      )}
    </>
  );
}
