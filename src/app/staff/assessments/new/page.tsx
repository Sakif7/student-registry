// Set an assessment for a module.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AssessmentForm } from "@/components/assessments/assessment-form";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { instantToWallTime } from "@/domain/college-time";
import { collegeTimeZone } from "@/server/college";
import { listModules } from "@/server/services/assessments";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Set an assessment" };

export default function NewAssessmentPage() {
  return (
    <>
      <PageHeader
        title="Set an assessment"
        description="Students enrolled on the module's programme can submit a PDF or Word document until you close the assessment."
      />
      <Suspense fallback={<Skeleton className="h-80 max-w-xl" />}>
        <NewAssessmentForm />
      </Suspense>
    </>
  );
}

async function NewAssessmentForm() {
  const session = await requirePageRole("staff");
  const modules = await listModules(session);
  const timeZone = collegeTimeZone();
  return (
    <AssessmentForm
      modules={modules}
      timeZone={timeZone}
      now={instantToWallTime(new Date(), timeZone)}
    />
  );
}
