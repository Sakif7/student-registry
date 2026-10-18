// The module catalogue: each module's credits, when it is taught, the
// programmes it is part of, and how many students take it this year, 20 to
// a page, with a search and filters kept in the address.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  EditModuleDialog,
  SetUpModuleDialog,
} from "@/components/curriculum/curriculum-dialogs";
import { ModuleFilterBar } from "@/components/curriculum/curriculum-filters";
import { listHref } from "@/components/lists/list-params";
import { Pagination } from "@/components/lists/pagination";
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
import {
  filterModules,
  MODULE_KIND_LABELS,
  type ModuleListQuery,
  moduleListSchema,
  SEMESTER_LABELS,
} from "@/domain/curriculum";
import { paginate } from "@/domain/lists";
import { collegeToday } from "@/server/college";
import { firstValues } from "@/server/pages";
import {
  listModuleSummaries,
  listProgrammeSummaries,
} from "@/server/services/curriculum";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Modules" };

export default function ModulesPage({
  searchParams,
}: PageProps<"/staff/modules">) {
  return (
    <>
      <PageHeader
        title="Modules"
        description="Every module, and the programmes it is part of. A module can be part of several programmes, in different years, as core or optional. Search by code or title, and filter by semester and programme."
        actions={<SetUpModuleDialog />}
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Modules searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Modules({
  searchParams,
}: {
  searchParams: PageProps<"/staff/modules">["searchParams"];
}) {
  const session = await requirePageRole("staff");
  const params = firstValues(await searchParams);
  const query = moduleListSchema.parse(params);
  const [modules, programmes] = await Promise.all([
    listModuleSummaries(session),
    listProgrammeSummaries(session),
  ]);
  const academicYear = academicYearOn(collegeToday());
  const page = paginate(filterModules(modules, query), query.page);
  // Remount when the filters change, so the selects show the ones applied,
  // but not as the search does: the search box keeps its own text.
  const settled = new URLSearchParams(params);
  settled.delete("q");
  settled.delete("page");
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
    <>
      <ModuleFilterBar
        key={settled.toString()}
        query={query}
        programmes={programmes}
      />
      {page.total === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No modules match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a shorter search, or{" "}
            <Link
              href="/staff/modules"
              className="underline underline-offset-4"
            >
              clear the filters
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">
              Modules matching the search and filters, by code
            </TableCaption>
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
              {page.items.map((module) => (
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
                      <span className="text-muted-foreground">
                        No programme yet
                      </span>
                    ) : (
                      <ul className="grid gap-0.5 text-sm">
                        {module.programmes.map((programme) => (
                          <li key={programme.code}>
                            <Link
                              href={`/staff/programmes/${programme.code}`}
                              className="font-mono text-xs underline underline-offset-4"
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
          <Pagination
            page={page}
            noun="module"
            hrefFor={(number) => moduleListHref({ ...query, page: number })}
          />
        </>
      )}
    </>
  );
}

/** The catalogue with these settings; the first page is left out. */
function moduleListHref(query: ModuleListQuery): string {
  return listHref("/staff/modules", {
    q: query.q,
    semester: query.semester,
    programme: query.programme,
    page: query.page && query.page > 1 ? query.page : undefined,
  });
}
