"use client";

// The students to move on, a page at a time, each with the step they take
// next, and the button that moves them all on. A step staff change is kept
// here while they page through the list or narrow it, and sent with the
// rest; everyone else takes the step shown. The request carries which
// students the list held, so a change made meanwhile is caught, not moved.
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { listHref } from "@/components/lists/list-params";
import { Pagination } from "@/components/lists/pagination";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { academicYearSlug } from "@/domain/academic-year";
import type { ProgressionStep } from "@/domain/progression";
import { ApiError, apiRequest } from "@/lib/api-client";
import { formatCount } from "@/lib/format";
import { refreshAfterWrite } from "@/server/actions";
import type {
  ProgressionList,
  ProgressionOutcome,
} from "@/server/services/progression";

export function ProgressionPlan({ list }: { list: ProgressionList }) {
  const [steps, setSteps] = useState<Record<string, ProgressionStep>>({});
  const { query, page, to } = list;
  const filtered = Boolean(query.q || query.programme || query.year);
  const hrefFor = (pageNumber: number) =>
    listHref("/staff/progression", {
      to: list.targets.length > 1 ? academicYearSlug(to) : undefined,
      q: query.q,
      programme: query.programme,
      year: query.year,
      page: pageNumber > 1 ? pageNumber : undefined,
    });

  if (page.total === 0) {
    return (
      <p className="text-muted-foreground">
        {filtered
          ? "No student still to move on matches these filters."
          : `Every enrolled student is in ${to} or later: nobody is waiting to move on.`}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Table>
        <TableCaption className="sr-only">
          Students to move on to {to}, by programme and year of study
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Programme</TableHead>
            <TableHead>Now</TableHead>
            <TableHead>Next step</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((student) => (
            <TableRow key={student.studentNumber}>
              <TableCell>
                <Link
                  href={`/staff/students/${student.studentNumber}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {student.fullName}
                </Link>
                <div className="font-mono text-xs text-muted-foreground">
                  {student.studentNumber}
                </div>
              </TableCell>
              <TableCell className="min-w-36 whitespace-normal">
                {student.programme.title}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                Year {student.yearOfStudy} · {student.academicYear}
              </TableCell>
              <TableCell>
                <NativeSelect
                  aria-label={`Next step for ${student.fullName}`}
                  value={steps[student.studentNumber] ?? student.suggested}
                  onChange={(event) => {
                    const step = event.currentTarget.value as ProgressionStep;
                    setSteps((current) => ({
                      ...current,
                      [student.studentNumber]: step,
                    }));
                  }}
                >
                  {student.steps.map(({ step, label }) => (
                    <NativeSelectOption key={step} value={step}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={page} noun="student" hrefFor={hrefFor} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {changedSteps(Object.keys(steps).length)}
        </p>
        <MoveOnButton
          to={to}
          total={page.total}
          request={{
            to,
            q: query.q,
            programme: query.programme,
            year: query.year,
            // Who was listed: if anyone has changed, nobody moves unseen.
            listed: list.listed,
            steps,
          }}
          onDone={() => setSteps({})}
        />
      </div>
    </div>
  );
}

/** Moves every student listed on, after saying what will happen. */
function MoveOnButton({
  to,
  total,
  request,
  onDone,
}: {
  to: string;
  total: number;
  request: Record<string, unknown>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const students = formatCount(total, "student");

  async function move() {
    setMoving(true);
    try {
      const { outcome } = await apiRequest<{ outcome: ProgressionOutcome }>(
        "POST",
        "/api/progression",
        request,
      );
      toast.success(describeOutcome(outcome, to));
      setOpen(false);
      onDone();
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setMoving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        Move {students} on to {to}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {students} on to {to}?
          </DialogTitle>
          <DialogDescription>
            Each takes the step shown, on every page of the list. Those moving
            up a year or repeating one are registered on the year&apos;s core
            modules and charged its fee. Completing is final. Anyone left for
            now stays where they are.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={moving} onClick={() => void move()}>
            {moving ? "Moving them on…" : "Move them on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** How many steps staff have changed, with the possessive in its place. */
function changedSteps(changed: number): string {
  if (changed === 0) {
    return "Each student takes the step shown unless you change it.";
  }
  const whose =
    changed === 1 ? "1 student's step" : `${changed} students' steps`;
  return `You've changed ${whose}; the rest take the one shown.`;
}

/** What moving students on did, in a sentence. */
function describeOutcome(outcome: ProgressionOutcome, to: string): string {
  const parts = [
    outcome.movedUp > 0 &&
      `${formatCount(outcome.movedUp, "student")} up a year`,
    outcome.repeating > 0 && `${outcome.repeating} repeating`,
    outcome.completed > 0 && `${outcome.completed} completed`,
  ].filter(Boolean);
  const left = [
    outcome.left > 0 && `${outcome.left} left for now`,
    outcome.skipped > 0 &&
      `${outcome.skipped} changed by someone else meanwhile, left as they were`,
  ].filter(Boolean);
  return `${parts.length > 0 ? `Moved on to ${to}: ${parts.join(", ")}.` : "Nobody moved on."}${left.length > 0 ? ` ${left.join("; ")}.` : ""}`;
}
