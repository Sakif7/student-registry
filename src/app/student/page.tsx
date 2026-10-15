// The student's home page: their own record.
import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My record" };

export default function StudentHomePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">My record</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-24 w-full" />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const session = await requirePageRole("student");
  return (
    <p className="mt-2 text-muted-foreground">
      Student ID {session.studentNumber}.
    </p>
  );
}
