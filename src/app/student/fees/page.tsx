// The student's own account, read-only: what they have been charged and
// paid, and what they owe.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountSection } from "@/components/fees/account-section";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { collegeTimeZone } from "@/server/college";
import { orNotFound } from "@/server/pages";
import { getAccount } from "@/server/services/fees";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My fees" };

export default function MyFeesPage() {
  return (
    <>
      <PageHeader
        title="My fees"
        description="What you have been charged and paid. Payments clear the oldest charge first. Contact the Registry about anything that looks wrong."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <MyFees />
      </Suspense>
    </>
  );
}

async function MyFees() {
  const session = await requirePageRole("student");
  const account = await orNotFound(getAccount(session, session.studentNumber));
  return <AccountSection account={account} timeZone={collegeTimeZone()} />;
}
