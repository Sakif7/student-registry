// A programme and its structure: a summary of its length, credits, fee,
// modules and students, then for each year of study the core modules every
// student takes and the options students choose from, with the credits they
// come to.
import { Banknote, BookOpen, CalendarRange, Layers, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AddStructureModuleDialog,
  EditProgrammeDialog,
} from "@/components/curriculum/curriculum-dialogs";
import { RemoveStructureModuleButton } from "@/components/curriculum/remove-structure-module-button";
import { PageHeader } from "@/components/page-header";
import { SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { MODULE_KIND_LABELS, SEMESTER_LABELS } from "@/domain/curriculum";
import { formatCount, formatMoney } from "@/lib/format";
import { orNotFound } from "@/server/pages";
import {
  getProgramme,
  listModuleSummaries,
  type StructureYear,
} from "@/server/services/curriculum";
import { requirePageRole } from "@/server/session";

export const metadata: Metadata = { title: "Programme" };

type Props = PageProps<"/staff/programmes/[code]">;

export default function ProgrammePage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-6">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <ProgrammeView params={params} />
    </Suspense>
  );
}

async function ProgrammeView({ params }: Pick<Props, "params">) {
  const session = await requirePageRole("staff");
  const { code } = await params;
  const [programme, modules] = await orNotFound(
    Promise.all([getProgramme(session, code), listModuleSummaries(session)]),
  );
  const placed = programme.structure.flatMap((year) => year.modules);
  const inProgramme = new Set(placed.map((m) => m.code));
  const core = placed.filter((m) => m.kind === "CORE").length;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Programmes", href: "/staff/programmes" }]}
        eyebrow={<span className="font-mono">{programme.code}</span>}
        title={programme.title}
        actions={
          <>
            <EditProgrammeDialog
              programme={{
                code: programme.code,
                title: programme.title,
                annualFeePence: programme.annualFeePence,
                years: programme.years,
                creditsPerYear: programme.creditsPerYear,
              }}
            />
            <AddStructureModuleDialog
              programmeCode={programme.code}
              years={programme.years}
              modules={modules.filter((m) => !inProgramme.has(m.code))}
            />
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6">
        <SummaryStrip
          facts={[
            {
              label: "Length",
              icon: CalendarRange,
              value: formatCount(programme.years, "year"),
              detail: "Of study",
            },
            {
              label: "Credits",
              icon: Layers,
              value: `${programme.creditsPerYear} a year`,
              detail: "Core and options together",
            },
            {
              label: "Fee",
              icon: Banknote,
              value: `${formatMoney(programme.annualFeePence)} a year`,
              detail: "The standard tuition fee",
            },
            {
              label: "Modules",
              icon: BookOpen,
              value: formatCount(placed.length, "module"),
              detail: `${core} core, ${placed.length - core} optional`,
            },
            {
              label: "Students",
              icon: Users,
              value: `${programme.enrolledCount} enrolled`,
              detail: "On the student list",
              link: {
                href: `/staff/students?programme=${encodeURIComponent(programme.code)}&status=ENROLLED`,
              },
            },
          ]}
        />
        {programme.structure.map((year) => (
          <YearCard
            key={year.yearOfStudy}
            programmeCode={programme.code}
            creditsPerYear={programme.creditsPerYear}
            year={year}
          />
        ))}
      </div>
    </>
  );
}

function YearCard({
  programmeCode,
  creditsPerYear,
  year,
}: {
  programmeCode: string;
  creditsPerYear: number;
  year: StructureYear;
}) {
  const optionsNeeded = creditsPerYear - year.coreCredits;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Year {year.yearOfStudy}</h2>
        </CardTitle>
        <CardDescription>
          Core modules take {year.coreCredits} of the {creditsPerYear} credits.
          {optionsNeeded > 0 &&
            ` Students choose ${optionsNeeded} more from ${year.optionalCredits} credits of options.`}
          {optionsNeeded > year.optionalCredits &&
            " There aren't enough options yet."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {year.modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No modules in year {year.yearOfStudy} yet.
          </p>
        ) : (
          // Fixed column widths, the same in every year, so the years'
          // columns line up one above the other.
          <Table className="min-w-2xl table-fixed">
            <TableCaption className="sr-only">
              Modules in year {year.yearOfStudy}, core first
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead className="w-20 text-right">Credits</TableHead>
                <TableHead className="w-32">Taught in</TableHead>
                <TableHead className="w-36">Core or optional</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {year.modules.map((module) => (
                <TableRow key={module.code}>
                  <TableCell className="min-w-48 whitespace-normal">
                    <span className="font-mono text-xs">{module.code}</span>{" "}
                    {module.title}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {module.credits}
                  </TableCell>
                  <TableCell>{SEMESTER_LABELS[module.semester]}</TableCell>
                  <TableCell>
                    <Badge
                      variant={module.kind === "CORE" ? "default" : "secondary"}
                    >
                      {MODULE_KIND_LABELS[module.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RemoveStructureModuleButton
                      programmeCode={programmeCode}
                      moduleCode={module.code}
                      yearOfStudy={year.yearOfStudy}
                      kind={module.kind}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
