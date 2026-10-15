// Registry dashboard: the staff home page.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Registry dashboard" };

export default function StaffDashboardPage() {
  return (
    <>
      <PageHeader
        title="Registry dashboard"
        actions={
          <Link href="/staff/students/new" className={buttonVariants()}>
            Enrol a student
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  await requirePageRole("staff");
  return (
    <p className="max-w-prose text-muted-foreground">
      Welcome to the Registry. Use the navigation above to work with student
      records.
    </p>
  );
}
