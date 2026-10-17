"use client";

// Moves a student to another enrolment status. Only the changes the rules
// allow are offered; deferral and withdrawal need a reason, which is kept in
// the status history.
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

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
    "Returning for a new academic year? Change the academic year with Edit details first, so the student is registered on that year's modules and asked for that year's fee.",
  DEFERRED:
    "A deferred student can't submit work. Fees don't change: correct the charge if the fee moves to a later year.",
  WITHDRAWN:
    "Withdrawal doesn't cancel what the student owes, which stays on the account. The student keeps sign-in, to see their fees and results, until you turn it off.",
  COMPLETED:
    "Completed is final: the status can't be changed again, so check the record first. The student keeps sign-in, to see their results.",
};

export function StatusChangeForm({
  studentNumber,
  allowed,
  onDone,
}: {
  studentNumber: string;
  allowed: readonly EnrolmentStatus[];
  /** Called once the status has changed, e.g. to close a dialog. */
  onDone?: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(changeStatusSchema),
    defaultValues: { status: allowed[0], reason: "" },
  });
  const status = useWatch({ control: form.control, name: "status" });
  const { errors, isSubmitting } = form.formState;

  async function save(values: {
    status: EnrolmentStatus;
    reason?: string | undefined;
  }) {
    try {
      await apiRequest("POST", `/api/students/${studentNumber}/status`, values);
      toast.success(
        `Status changed to ${ENROLMENT_STATUS_LABELS[values.status]}.`,
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
        description={CHANGE_NOTES[status]}
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
