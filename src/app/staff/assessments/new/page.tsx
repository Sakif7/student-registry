// Set an assessment for a module, chosen by programme.
import type { Metadata } from "next";
import { Suspense } from "react";

import { AssessmentForm } from "@/components/assessments/assessment-form";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { instantToWallTime } from "@/domain/college-time";
import { collegeTimeZone } from "@/server/college";
import {
  listProgrammeModules,
  registeredByModule,
} from "@/server/services/assessments";
import { calendarsAhead } from "@/server/services/curriculum";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Set an assessment" };

export default function NewAssessmentPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Assessments", href: "/staff/assessments" }]}
        title="Set an assessment"
        description="Enrolled students registered on the module can submit a PDF or Word document until you close the assessment."
      />
      <Suspense fallback={<Skeleton className="h-80 max-w-xl" />}>
        <NewAssessmentForm />
      </Suspense>
    </>
  );
}

async function NewAssessmentForm() {
  const session = await requirePageRole("staff");
  const [programmes, registered, calendars] = await Promise.all([
    listProgrammeModules(session),
    registeredByModule(session),
    calendarsAhead(session),
  ]);
  const timeZone = collegeTimeZone();
  return (
    <AssessmentForm
      programmes={programmes}
      registered={registered}
      calendars={calendars}
      timeZone={timeZone}
      now={instantToWallTime(new Date(), timeZone)}
    />
  );
}
