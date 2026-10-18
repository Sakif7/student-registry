// The audit trail: every change made in the Registry, newest first, and who
// made it, narrowed by a search and a kind of change kept in the address.
import type { Metadata } from "next";
import { Suspense } from "react";

import { ActivityFilterBar } from "@/components/activity/activity-filters";
import { ActivityLog } from "@/components/activity/activity-log";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { activityQuerySchema } from "@/domain/audit";
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
        description="Every change made in the Registry, newest first, and who made it. Search by student or staff member, or choose a kind of change."
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
  const params = firstValues(await searchParams);
  const query = activityQuerySchema.parse(params);
  const page = await listActivity(session, params);
  return (
    <>
      <ActivityFilterBar query={query} />
      <ActivityLog page={page} query={query} timeZone={collegeTimeZone()} />
    </>
  );
}
