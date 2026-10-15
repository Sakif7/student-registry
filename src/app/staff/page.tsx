// Registry dashboard: the staff home page. Shows how many students are in
// each enrolment status, and flags every overdue balance.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { OverdueTable } from "@/components/dashboard/overdue-table";
import { StatusCounts } from "@/components/dashboard/status-counts";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/server/services/dashboard";
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
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const session = await requirePageRole("staff");
  const dashboard = await getDashboard(session);
  return (
    <div className="grid gap-10">
      <section aria-labelledby="students-heading" className="grid gap-3">
        <h2
          id="students-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Students
        </h2>
        <StatusCounts
          counts={dashboard.statusCounts}
          total={dashboard.totalStudents}
        />
      </section>

      <section aria-labelledby="overdue-heading">
        <h2
          id="overdue-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Overdue fees
        </h2>
        <p className="mt-1 mb-4 max-w-prose text-sm text-muted-foreground">
          Fees still unpaid after their due date, longest overdue first.
          Withdrawn and completed students are included: their debts still need
          chasing.
        </p>
        <OverdueTable
          accounts={dashboard.overdueAccounts}
          totalPence={dashboard.totalOverduePence}
        />
      </section>
    </div>
  );
}
