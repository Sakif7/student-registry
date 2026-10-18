"use client";

// Moves a student to another enrolment status. Only the changes the rules
// allow are offered; deferral and withdrawal need a reason, which is kept in
// the status history.
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Form } from "@/components/forms/form";
import { FormDialogFooter } from "@/components/forms/form-dialog";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  ENROLMENT_STATUS_LABELS,
  type EnrolmentStatus,
  statusChangeNeedsReason,
} from "@/domain/enrolment";
import { changeStatusSchema } from "@/domain/students";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

/** What each change means for the record, said before it is made. */
const CHANGE_NOTES: Record<EnrolmentStatus, string> = {
  ENROLLED:
    "The student is registered on the modules of the year they return in, and the record asks for that year's fee.",
  DEFERRED:
    "A deferred student can't submit work. Fees don't change: correct the charge if the fee moves to a later year.",
  WITHDRAWN:
    "Withdrawal leaves the year's fee as it is: review the charge for what the student is liable for, from when they stopped attending. They keep sign-in, to see their fees and results, until you turn it off.",
  COMPLETED:
    "Completed is final: the status can't be changed again, so check the record first. The student keeps sign-in, to see their results.",
};

type StatusInput = z.output<typeof changeStatusSchema>;

/** What a student returning to Enrolled can return to, and their sign-in. */
export interface Returning {
  /** The academic years they can return in: this one or next. */
  academicYears: string[];
  /** Chosen to begin with: their record's year, or this one if it ended. */
  academicYear: string;
  yearOfStudy: number;
  /** Their programme's years of study. */
  years: number;
  /** Whether staff have turned their sign-in off. */
  signInOff: boolean;
}

export function StatusChangeForm({
  studentNumber,
  allowed,
  returning,
  onDone,
}: {
  studentNumber: string;
  allowed: readonly EnrolmentStatus[];
  /** For a student who can return to Enrolled. */
  returning?: Returning;
  /** Called once the status has changed, e.g. to close a dialog. */
  onDone?: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(changeStatusSchema),
    defaultValues: {
      status: allowed[0],
      reason: "",
      academicYear: returning?.academicYear,
      yearOfStudy: returning?.yearOfStudy,
    },
  });
  const status = useWatch({ control: form.control, name: "status" });
  const { errors, isSubmitting } = form.formState;
  const returningNow = status === "ENROLLED" ? returning : undefined;

  async function save({ academicYear, yearOfStudy, ...change }: StatusInput) {
    try {
      // Only a return to Enrolled moves the student's year with it.
      await apiRequest(
        "POST",
        `/api/students/${studentNumber}/status`,
        change.status === "ENROLLED"
          ? { ...change, academicYear, yearOfStudy }
          : change,
      );
      toast.success(
        `Status changed to ${ENROLMENT_STATUS_LABELS[change.status]}.${
          change.status === "ENROLLED" && returning?.signInOff
            ? " Sign-in is still turned off."
            : ""
        }`,
      );
      await refreshAfterWrite();
      onDone?.();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  if (allowed.length === 0) {
    return (
      <p className="text-muted-foreground">
        Completed is final: this record&apos;s status can no longer change.
      </p>
    );
  }

  return (
    <Form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void form.handleSubmit(save)(event)}
    >
      <FormField
        id="status"
        label="New status"
        description={`${CHANGE_NOTES[status]}${
          returningNow?.signInOff
            ? " Sign-in is turned off for this student: turn it back on in the Sign-in tab, or they can't sign in."
            : ""
        }`}
        error={errors.status?.message}
      >
        {(control) => (
          <NativeSelect {...control} {...form.register("status")}>
            {allowed.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {ENROLMENT_STATUS_LABELS[option]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {returningNow && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="academicYear"
            label="Returning in"
            error={errors.academicYear?.message}
          >
            {(control) => (
              <NativeSelect {...control} {...form.register("academicYear")}>
                {returningNow.academicYears.map((year) => (
                  <NativeSelectOption key={year} value={year}>
                    {year}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id="yearOfStudy"
            label="Year of study"
            error={errors.yearOfStudy?.message}
          >
            {(control) => (
              <NativeSelect {...control} {...form.register("yearOfStudy")}>
                {Array.from({ length: returningNow.years }, (_, index) => (
                  <NativeSelectOption key={index} value={index + 1}>
                    Year {index + 1}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
      )}
      <FormField
        id="reason"
        label={
          statusChangeNeedsReason(status)
            ? "Reason (required)"
            : "Reason (optional)"
        }
        description="Kept in the status history, which the student sees on their record."
        error={errors.reason?.message}
      >
        {(control) => (
          <Textarea {...control} rows={3} {...form.register("reason")} />
        )}
      </FormField>
      <FormDialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Change status"}
        </Button>
      </FormDialogFooter>
    </Form>
  );
}
