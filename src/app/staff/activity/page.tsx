// The audit trail: every change made in the Registry, newest first, and who
// made it.
import type { Metadata } from "next";
import { Suspense } from "react";

import { ActivityLog } from "@/components/activity/activity-log";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { collegeTimeZone } from "@/server/college";
import { firstValues } from "@/server/pages";
import { listActivity } from "@/server/services/activity";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage({
  searchParams,
}: PageProps<"/staff/activity">) {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Every change made in the Registry, newest first, and who made it."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Activity({
  searchParams,
}: {
  searchParams: PageProps<"/staff/activity">["searchParams"];
}) {
  const session = await requirePageRole("staff");
  const page = await listActivity(session, firstValues(await searchParams));
  return <ActivityLog page={page} timeZone={collegeTimeZone()} />;
}
