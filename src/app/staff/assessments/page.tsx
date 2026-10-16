// Assessments: the work set for each module, open assessments first. The
// column headings sort the list, and the order stays in the address.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AssessmentsTable } from "@/components/assessments/assessments-table";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { assessmentOrderSchema, sortAssessments } from "@/domain/submissions";
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
        description="Work set for each module. Open assessments come first, soonest deadline first; the column headings sort the list another way."
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
  const order = assessmentOrderSchema.parse(firstValues(await searchParams));
  const assessments = sortAssessments(
    await listAssessments(session),
    order.sort,
    order.dir,
  );
  return (
    <AssessmentsTable
      assessments={assessments}
      order={order}
      timeZone={collegeTimeZone()}
    />
  );
}
