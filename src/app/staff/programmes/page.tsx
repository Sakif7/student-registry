// Programmes: each one's length, credits and fee, with how many modules and
// enrolled students it has. A programme's page holds its structure.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SetUpProgrammeDialog } from "@/components/curriculum/curriculum-dialogs";
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
import { formatCount, formatMoney } from "@/lib/format";
import { listProgrammeSummaries } from "@/server/services/curriculum";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Programmes" };

export default function ProgrammesPage() {
  return (
    <>
      <PageHeader
        title="Programmes"
        description="Each programme's length, the credits each year carries, and its annual fee. Open one for its modules, year by year."
        actions={<SetUpProgrammeDialog />}
      />
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Programmes />
      </Suspense>
    </>
  );
}

async function Programmes() {
  const session = await requirePageRole("staff");
  const programmes = await listProgrammeSummaries(session);
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
    <Table>
      <TableCaption className="sr-only">Programmes, by title</TableCaption>
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
        {programmes.map((programme) => (
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
                <span className="sr-only"> enrolled on {programme.title}</span>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
