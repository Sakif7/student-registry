// Progression: moving students on to a new academic year. The enrolled
// students still in an earlier year, 20 to a page, each with the step they
// take next, which staff can change, and one button that moves them all on.
// A search and filters narrow the list, and stay in the address.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ProgressionFilterBar } from "@/components/progression/progression-filters";
import { ProgressionPlan } from "@/components/progression/progression-plan";
import { Skeleton } from "@/components/ui/skeleton";
import { firstValues } from "@/server/pages";
import { listToProgress } from "@/server/services/progression";
import { listProgrammes } from "@/server/services/students";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Progression" };

type Props = PageProps<"/staff/progression">;

export default function ProgressionPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader
        title="Progression"
        description="Students still enrolled in an earlier academic year, each with the step they take next: up a year, or complete in their final year. Change anyone repeating a year, leave anyone awaiting a decision, then move them on together."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Progression searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Progression({ searchParams }: Pick<Props, "searchParams">) {
  const session = await requirePageRole("staff");
  const params = firstValues(await searchParams);
  const [list, programmes] = await Promise.all([
    listToProgress(session, params),
    listProgrammes(session),
  ]);
  return (
    <div className="grid grid-cols-1 gap-6">
      <ProgressionFilterBar
        query={list.query}
        targets={list.targets}
        programmes={programmes}
        maxYears={Math.max(1, ...programmes.map(({ years }) => years))}
      />
      <ProgressionPlan list={list} />
    </div>
  );
}
