// Registry dashboard: the staff home page.
import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Registry dashboard" };

export default function StaffDashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Registry dashboard
      </h1>
      <Suspense fallback={<Skeleton className="mt-6 h-24 w-full" />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  await requirePageRole("staff");
  return (
    <p className="mt-2 max-w-prose text-muted-foreground">
      Welcome to the Registry. Use the navigation above to work with student
      records.
    </p>
  );
}
