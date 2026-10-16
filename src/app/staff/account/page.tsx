// The signed-in member of staff's own account: their details, their
// password, and the devices they are signed in on.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountView } from "@/components/account/account-view";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Your account" };

export default function StaffAccountPage() {
  return (
    <>
      <PageHeader title="Your account" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <StaffAccount />
      </Suspense>
    </>
  );
}

async function StaffAccount() {
  return <AccountView session={await requirePageRole("staff")} />;
}
