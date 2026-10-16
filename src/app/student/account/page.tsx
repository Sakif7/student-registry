// The signed-in student's own account: their details, their password, and
// the devices they are signed in on.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountView } from "@/components/account/account-view";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Your account" };

export default function StudentAccountPage() {
  return (
    <>
      <PageHeader title="Your account" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <StudentAccount />
      </Suspense>
    </>
  );
}

async function StudentAccount() {
  return <AccountView session={await requirePageRole("student")} />;
}
