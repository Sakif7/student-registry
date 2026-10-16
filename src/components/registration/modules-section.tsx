// A student's modules, as staff see them on the student's record and the
// student on their own page: a summary of the year's credits and semesters;
// this academic year's registrations, by semester; the options of the
// student's year, which can be added while changes are open to the viewer;
// and the modules of earlier years.
import { CalendarDays, Layers } from "lucide-react";

import { type SummaryFact, SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MODULE_KIND_LABELS,
  type Semester,
  SEMESTER_LABELS,
} from "@/domain/curriculum";
import { formatCount, formatDate } from "@/lib/format";
import type { StudentModules } from "@/server/services/registrations";

import { RegistrationButton } from "./registration-button";

type Viewer = "staff" | "student";

export function ModulesSection({
  modules,
  viewer,
}: {
  modules: StudentModules;
  /** Who is looking: the student reads about their own modules. */
  viewer: Viewer;
}) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <SummaryStrip facts={yearFacts(modules)} />
      <RegisteredCard modules={modules} viewer={viewer} />
      {modules.options.length > 0 && (
        <OptionsCard modules={modules} viewer={viewer} />
      )}
      {modules.history.length > 0 && (
        <EarlierYearsCard history={modules.history} />
      )}
    </div>
  );
}

/** The credits still to choose this year, if any. */
function creditsLeft(modules: StudentModules): number {
  return Math.max(modules.creditsPerYear - modules.registeredCredits, 0);
}

/**
 * The year's credits, and each semester with how many of the student's
 * modules are taught in it, counting all-year ones in both.
 */
function yearFacts(modules: StudentModules): SummaryFact[] {
  const left = creditsLeft(modules);
  const enrolled = modules.status === "ENROLLED";
  const credits: SummaryFact = {
    label: "Credits",
    icon: Layers,
    value: `${modules.registeredCredits} of ${modules.creditsPerYear}`,
    tone: !enrolled ? "neutral" : left > 0 ? "attention" : "positive",
    progress: { value: modules.registeredCredits, max: modules.creditsPerYear },
    detail:
      left === 0
        ? "The year's credits are made up"
        : enrolled
          ? `${left} credits to choose`
          : `${left} credits short`,
  };
  const { calendar } = modules;
  if (!calendar) {
    return [
      credits,
      {
        label: "Semesters",
        icon: CalendarDays,
        value: "Not set yet",
        detail: `The dates for ${modules.academicYear} aren't set`,
      },
    ];
  }
  const taught = (semester: Semester) =>
    formatCount(
      modules.registered.filter(
        (module) =>
          module.semester === semester || module.semester === "ALL_YEAR",
      ).length,
      "module",
    );
  return [
    credits,
    {
      label: "Semester 1",
      icon: CalendarDays,
      value: `${formatDate(calendar.semester1Start)} to ${formatDate(calendar.semester1End)}`,
      detail: `${taught("FIRST")} taught`,
    },
    {
      label: "Semester 2",
      icon: CalendarDays,
      value: `${formatDate(calendar.semester2Start)} to ${formatDate(calendar.semester2End)}`,
      detail: `${taught("SECOND")} taught`,
    },
  ];
}

function RegisteredCard({
  modules,
  viewer,
}: {
  modules: StudentModules;
  viewer: Viewer;
}) {
  const changing = modules.changes.allowed;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Modules in {modules.academicYear}</h2>
        </CardTitle>
        <CardDescription>
          Year {modules.yearOfStudy} of {modules.programme.title}, by semester.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {modules.registered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {viewer === "student" ? "You aren't" : "Not"} registered on any
            modules in {modules.academicYear}.
          </p>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Modules registered for {modules.academicYear}, by semester
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead>Taught in</TableHead>
                <TableHead>Core or optional</TableHead>
                {changing && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.registered.map((module) => (
                <TableRow key={module.code}>
                  <ModuleCell module={module} />
                  <TableCell className="text-right tabular-nums">
                    {module.credits}
                  </TableCell>
                  <TableCell>{SEMESTER_LABELS[module.semester]}</TableCell>
                  <TableCell>
                    {module.kind ? (
                      <Badge
                        variant={
                          module.kind === "CORE" ? "default" : "secondary"
                        }
                      >
                        {MODULE_KIND_LABELS[module.kind]}
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        Outside year {modules.yearOfStudy}
                      </Badge>
                    )}
                  </TableCell>
                  {changing && (
                    <TableCell className="text-right">
                      {module.drop.allowed ? (
                        <RegistrationButton
                          studentNumber={modules.studentNumber}
                          moduleCode={module.code}
                          action="drop"
                          undoable={module.kind === "OPTIONAL"}
                        />
                      ) : (
                        // Why a module that isn't core can't be dropped.
                        module.kind !== "CORE" &&
                        module.hasWork && (
                          <span className="text-xs text-muted-foreground">
                            Has work
                          </span>
                        )
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {modules.registeredCredits}
                </TableCell>
                <TableCell colSpan={changing ? 3 : 2} />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OptionsCard({
  modules,
  viewer,
}: {
  modules: StudentModules;
  viewer: Viewer;
}) {
  const left = creditsLeft(modules);
  const { changes } = modules;
  const own = viewer === "student";
  const description = !changes.allowed
    ? changes.message
    : left > 0
      ? own
        ? `Choose ${left} more credits from these options.`
        : `${left} credits are left to choose from these options.`
      : `The year's credits are taken: drop an option to ${own ? "choose" : "add"} another.`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Options</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption className="sr-only">
            Options of year {modules.yearOfStudy} not yet taken
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead className="text-right">Credits</TableHead>
              <TableHead>Taught in</TableHead>
              {changes.allowed && (
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.options.map((option) => (
              <TableRow key={option.code}>
                <ModuleCell module={option} />
                <TableCell className="text-right tabular-nums">
                  {option.credits}
                </TableCell>
                <TableCell>{SEMESTER_LABELS[option.semester]}</TableCell>
                {changes.allowed && (
                  <TableCell className="text-right">
                    {option.fits ? (
                      <RegistrationButton
                        studentNumber={modules.studentNumber}
                        moduleCode={option.code}
                        action="add"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Too many credits
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EarlierYearsCard({ history }: { history: StudentModules["history"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Earlier years</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {history.map((year) => (
          <div key={year.academicYear} className="grid gap-2">
            <h3 className="font-medium">{year.academicYear}</h3>
            <ul className="grid gap-1 text-sm">
              {year.modules.map((module) => (
                <li key={module.code} className="flex justify-between gap-4">
                  <span>
                    <span className="font-mono text-xs">{module.code}</span>{" "}
                    {module.title}
                  </span>
                  <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatCount(module.credits, "credit")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ModuleCell({ module }: { module: { code: string; title: string } }) {
  return (
    <TableCell className="min-w-48 whitespace-normal">
      <span className="font-mono text-xs">{module.code}</span> {module.title}
    </TableCell>
  );
}
