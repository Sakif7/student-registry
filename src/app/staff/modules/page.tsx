// The module catalogue: each module's credits, when it is taught, the
// programmes it is part of, and how many students take it this year.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  EditModuleDialog,
  SetUpModuleDialog,
} from "@/components/curriculum/curriculum-dialogs";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { academicYearOn } from "@/domain/academic-year";
import { MODULE_KIND_LABELS, SEMESTER_LABELS } from "@/domain/curriculum";
import { collegeToday } from "@/server/college";
import { listModuleSummaries } from "@/server/services/curriculum";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Modules" };

export default function ModulesPage() {
  return (
    <>
      <PageHeader
        title="Modules"
        description="Every module, and the programmes it is part of. A module can be part of several programmes, in different years, as core or optional."
        actions={<SetUpModuleDialog />}
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Modules />
      </Suspense>
    </>
  );
}

async function Modules() {
  const session = await requirePageRole("staff");
  const modules = await listModuleSummaries(session);
  const academicYear = academicYearOn(collegeToday());
  if (modules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No modules yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Set one up, then add it to programmes from their pages.
        </p>
      </div>
    );
  }
  return (
    <Table>
      <TableCaption className="sr-only">Modules, by code</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Module</TableHead>
          <TableHead className="text-right">Credits</TableHead>
          <TableHead>Taught in</TableHead>
          <TableHead>Part of</TableHead>
          <TableHead className="text-right">
            Students in {academicYear}
          </TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {modules.map((module) => (
          <TableRow key={module.code}>
            <TableCell className="min-w-48 whitespace-normal">
              <span className="font-mono text-xs">{module.code}</span>{" "}
              <span className="font-medium">{module.title}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {module.credits}
            </TableCell>
            <TableCell>{SEMESTER_LABELS[module.semester]}</TableCell>
            <TableCell className="min-w-48 whitespace-normal">
              {module.programmes.length === 0 ? (
                <span className="text-muted-foreground">No programme yet</span>
              ) : (
                <ul className="grid gap-0.5 text-sm">
                  {module.programmes.map((programme) => (
                    <li key={programme.code}>
                      <Link
                        href={`/staff/programmes/${programme.code}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {programme.code}
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        year {programme.yearOfStudy},{" "}
                        {MODULE_KIND_LABELS[programme.kind].toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {module.registeredCount}
            </TableCell>
            <TableCell className="text-right">
              <EditModuleDialog
                module={{
                  code: module.code,
                  title: module.title,
                  credits: module.credits,
                  semester: module.semester,
                }}
                creditsLocked={module.creditsLocked}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
