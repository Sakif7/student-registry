// Assessments: the work set for each module, open assessments first.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AssessmentsTable } from "@/components/assessments/assessments-table";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { collegeTimeZone } from "@/server/college";
import { listAssessments } from "@/server/services/assessments";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Assessments" };

export default function AssessmentsPage() {
  return (
    <>
      <PageHeader
        title="Assessments"
        description="Work set for each module. Open assessments come first, soonest deadline first."
        actions={
          <Link href="/staff/assessments/new" className={buttonVariants()}>
            Set an assessment
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Assessments />
      </Suspense>
    </>
  );
}

async function Assessments() {
  const session = await requirePageRole("staff");
  const assessments = await listAssessments(session);
  return (
    <AssessmentsTable assessments={assessments} timeZone={collegeTimeZone()} />
  );
}
