"use client";

// An assessment's marksheet: every student who should submit or did, their
// work, and a mark for each. Classifications update as marks are typed; only
// the marks that changed are sent, and a cleared mark is removed.
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Form } from "@/components/forms/form";
import { applyServerErrors } from "@/components/forms/server-errors";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EnrolmentStatus } from "@/domain/enrolment";
import {
  CLASSIFICATION_LABELS,
  classify,
  MARKS_NOT_YET_MESSAGE,
  markFieldSchema,
} from "@/domain/results";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

import { LateBadge } from "./assessment-badges";

/** One student's line, with dates and sizes already formatted for display. */
export interface MarksheetRow {
  studentNumber: string;
  fullName: string;
  status: EnrolmentStatus;
  resultsWithheld: boolean;
  /** Counted in "submitted of expected"; listed anyway for their work. */
  expected: boolean;
  submission: {
    id: string;
    fileName: string;
    size: string;
    submittedAt: string;
    late: boolean;
    replacedTimes: number;
  } | null;
  mark: number | null;
  /** When the mark was published, e.g. "1 Oct 2026"; null if it isn't. */
  publishedOn: string | null;
}

const marksheetFormSchema = z.object({
  marks: z.record(z.string(), markFieldSchema),
});

export function Marksheet({
  assessmentId,
  title,
  rows,
  marksOpen,
}: {
  assessmentId: string;
  title: string;
  rows: MarksheetRow[];
  /** False until the deadline passes or the assessment closes. */
  marksOpen: boolean;
}) {
  const saved = new Map(rows.map((row) => [row.studentNumber, row.mark]));
  // Unique to this marksheet, as a hidden page's marksheet stays in the
  // document and may list the same students.
  const idPrefix = useId();
  const form = useForm({
    resolver: zodResolver(marksheetFormSchema),
    defaultValues: {
      marks: Object.fromEntries(
        rows.map((row) => [row.studentNumber, row.mark?.toString() ?? ""]),
      ),
    },
  });
  const typed = useWatch({ control: form.control, name: "marks" });
  const { errors, isSubmitting } = form.formState;

  async function save(values: { marks: Record<string, number | null> }) {
    const changed = Object.fromEntries(
      Object.entries(values.marks).filter(
        ([studentNumber, mark]) => mark !== saved.get(studentNumber),
      ),
    );
    const count = Object.keys(changed).length;
    if (count === 0) {
      toast.info("No marks have changed.");
      return;
    }
    try {
      await apiRequest("PUT", `/api/assessments/${assessmentId}/marks`, {
        marks: changed,
      });
      toast.success(`Saved ${count} ${count === 1 ? "mark" : "marks"}.`);
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Form noValidate onSubmit={(event) => void form.handleSubmit(save)(event)}>
      <Table>
        <TableCaption className="sr-only">
          Marksheet for {title}: submissions and marks by student
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Submission</TableHead>
            <TableHead>Mark</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const { studentNumber, submission } = row;
            const text = typed[studentNumber] ?? "";
            const parsed = markFieldSchema.safeParse(text);
            const mark = parsed.success ? parsed.data : undefined;
            const error = errors.marks?.[studentNumber]?.message;
            const errorId = `${idPrefix}mark-${studentNumber}-error`;
            return (
              <TableRow key={studentNumber}>
                <TableCell>
                  <Link
                    href={`/staff/students/${studentNumber}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.fullName}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {studentNumber}
                    </span>
                    {row.status !== "ENROLLED" && (
                      <StatusBadge status={row.status} />
                    )}
                    {!row.expected && (
                      <span className="text-xs text-muted-foreground">
                        Not expected to submit
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-72 min-w-56 whitespace-normal">
                  {submission ? (
                    <>
                      <a
                        href={`/api/submissions/${submission.id}/file`}
                        className="wrap-anywhere underline underline-offset-4"
                      >
                        <span className="sr-only">Download </span>
                        {submission.fileName}
                      </a>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {submission.submittedAt} · {submission.size}
                        {submission.late && <LateBadge />}
                      </div>
                      {submission.replacedTimes > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Replaced {submission.replacedTimes}{" "}
                          {submission.replacedTimes === 1 ? "time" : "times"}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not submitted</span>
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    className="w-20"
                    disabled={!marksOpen}
                    aria-label={`Mark for ${row.fullName}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    {...form.register(`marks.${studentNumber}`)}
                  />
                  {error && (
                    <p
                      id={errorId}
                      className="mt-1 max-w-48 text-xs whitespace-normal text-destructive"
                    >
                      {error}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  {mark != null && CLASSIFICATION_LABELS[classify(mark)]}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {mark !== saved.get(studentNumber)
                      ? "Not saved yet"
                      : row.publishedOn
                        ? `Published ${row.publishedOn}`
                        : row.mark !== null && "Not published"}
                    {row.resultsWithheld && (
                      <Badge className="border-transparent bg-amber-100 text-amber-900">
                        Results withheld
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {marksOpen ? (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save marks"}
          </Button>
          <p className="max-w-prose text-sm text-muted-foreground">
            Marks are whole numbers from 0 to 100: Pass from 40, Merit from 60,
            Distinction from 70. Clear a mark to remove it. Students see marks
            only once you publish them: saved marks can be published here, to
            everyone at once, or from a student&apos;s record.
          </p>
        </div>
      ) : (
        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          {MARKS_NOT_YET_MESSAGE}
        </p>
      )}
    </Form>
  );
}
