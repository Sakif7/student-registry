// Programmes: each one's length, credits and fee, with how many modules and
// enrolled students it has, 20 to a page, with a search kept in the address.
// A programme's page holds its structure.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SetUpProgrammeDialog } from "@/components/curriculum/curriculum-dialogs";
import { ProgrammeFilterBar } from "@/components/curriculum/curriculum-filters";
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
import { filterProgrammes, programmeListSchema } from "@/domain/curriculum";
import { paginate } from "@/domain/lists";
import { formatCount, formatMoney } from "@/lib/format";
import { firstValues } from "@/server/pages";
import { listProgrammeSummaries } from "@/server/services/curriculum";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Programmes" };

export default function ProgrammesPage({
  searchParams,
}: PageProps<"/staff/programmes">) {
  return (
    <>
      <PageHeader
        title="Programmes"
        description="Each programme's length, the credits each year carries, and its annual fee. Search by code or title, and open one for its modules, year by year."
        actions={<SetUpProgrammeDialog />}
      />
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Programmes searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Programmes({
  searchParams,
}: {
  searchParams: PageProps<"/staff/programmes">["searchParams"];
}) {
  const session = await requirePageRole("staff");
  const query = programmeListSchema.parse(firstValues(await searchParams));
  const programmes = await listProgrammeSummaries(session);
  const page = paginate(filterProgrammes(programmes, query.q), query.page);
  if (programmes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No programmes yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Set one up, then add its modules.
        </p>
      </div>
    );
  }
  return (
    <>
      <ProgrammeFilterBar query={query} />
      {page.total === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">No programmes match this search.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a shorter search, or{" "}
            <Link
              href="/staff/programmes"
              className="underline underline-offset-4"
            >
              clear it
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <Table>
            <TableCaption className="sr-only">
              Programmes matching the search, by title
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Programme</TableHead>
                <TableHead>Length</TableHead>
                <TableHead className="text-right">Credits a year</TableHead>
                <TableHead className="text-right">Annual fee</TableHead>
                <TableHead className="text-right">Modules</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((programme) => (
                <TableRow key={programme.code}>
                  <TableCell className="min-w-56 whitespace-normal">
                    <Link
                      href={`/staff/programmes/${programme.code}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {programme.title}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">
                      {programme.code}
                    </div>
                  </TableCell>
                  <TableCell>{formatCount(programme.years, "year")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {programme.creditsPerYear}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(programme.annualFeePence)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {programme.moduleCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Link
                      href={`/staff/students?programme=${encodeURIComponent(programme.code)}&status=ENROLLED`}
                      className="underline underline-offset-4"
                    >
                      {programme.enrolledCount}
                      <span className="sr-only">
                        {" "}
                        enrolled on {programme.title}
                      </span>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            noun="programme"
            hrefFor={(number) =>
              listHref("/staff/programmes", {
                q: query.q,
                page: number > 1 ? number : undefined,
              })
            }
          />
        </>
      )}
    </>
  );
}
