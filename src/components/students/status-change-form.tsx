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
      <FormField id="status" label="New status" error={errors.status?.message}>
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
        description="Kept in the status history."
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
