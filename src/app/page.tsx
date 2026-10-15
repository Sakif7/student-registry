// Landing page: choose to use the registry as Registry staff or as a student.
// It stands in for a sign-in screen; the brief allows a role toggle instead of
// authentication (see .docs/DECISIONS.md, "Roles").
import { Suspense } from "react";

import { AppHeader } from "@/components/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewPicker } from "@/components/view-picker";
import { listViewers } from "@/server/services/viewers";
import { currentSession } from "@/server/session";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a view</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          This demo has no sign-in. Choose whether to use the registry as
          Registry staff or as one of the students; you can switch at any time.
        </p>
        <div className="mt-8">
          <Suspense
            fallback={
              <div className="grid gap-6 md:grid-cols-2">
                <Skeleton className="h-48" />
                <Skeleton className="h-48" />
              </div>
            }
          >
            <Picker />
          </Suspense>
        </div>
      </main>
    </>
  );
}

async function Picker() {
  const session = await currentSession();
  const students = await listViewers();
  return (
    <ViewPicker
      students={students}
      currentStudent={
        session?.role === "student" ? session.studentNumber : undefined
      }
    />
  );
}
