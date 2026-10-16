// The student's modules this academic year, and the options of their year:
// while their academic year lets students choose, they add and drop
// options here themselves.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ModulesSection } from "@/components/registration/modules-section";
import { Skeleton } from "@/components/ui/skeleton";
import { orNotFound } from "@/server/pages";
import { getStudentModules } from "@/server/services/registrations";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "My modules" };

export default function MyModulesPage() {
  return (
    <>
      <PageHeader
        title="My modules"
        description="The modules you are registered on this academic year, with the credits they come to. Core modules are registered for you; options are chosen."
      />
      <Suspense
        fallback={
          <div className="grid gap-6">
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        }
      >
        <MyModules />
      </Suspense>
    </>
  );
}

async function MyModules() {
  const session = await requirePageRole("student");
  const modules = await orNotFound(
    getStudentModules(session, session.studentNumber),
  );
  return <ModulesSection modules={modules} viewer="student" />;
}
