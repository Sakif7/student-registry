"use client";

// Withholds all of a student's results, with a reason the student is shown.
// Outstanding tuition fees, the usual reason, is offered as a preset.
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormField } from "@/components/forms/form-field";
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
import { FieldGroup } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  OUTSTANDING_FEES_REASON,
  withholdResultsSchema,
} from "@/domain/results";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

const formSchema = z
  .object({ preset: z.enum(["fees", "other"]), other: z.string() })
  .superRefine((values, ctx) => {
    if (values.preset !== "other") return;
    const result = withholdResultsSchema.safeParse({ reason: values.other });
    for (const issue of result.error?.issues ?? []) {
      ctx.addIssue({ code: "custom", path: ["other"], message: issue.message });
    }
  });

export function WithholdResultsDialog({
  studentNumber,
  fullName,
  feeNote,
}: {
  studentNumber: string;
  fullName: string;
  /** The student's fee position, e.g. "Fees: £9,535.00 overdue". */
  feeNote: string;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { preset: "fees" as const, other: "" },
  });
  const preset = useWatch({ control: form.control, name: "preset" });
  const { errors, isSubmitting } = form.formState;

  async function withhold(values: { preset: "fees" | "other"; other: string }) {
    const reason =
      values.preset === "fees" ? OUTSTANDING_FEES_REASON : values.other.trim();
    try {
      await apiRequest("PUT", `/api/students/${studentNumber}/results/hold`, {
        reason,
      });
      toast.success(`Results withheld for ${fullName}.`);
      setOpen(false);
      form.reset();
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      const [message] = error.fieldErrors.reason ?? [];
      if (message) form.setError("other", { type: "server", message });
      toast.error(error.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        Withhold results
      </DialogTrigger>
      <DialogContent>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => void form.handleSubmit(withhold)(event)}
        >
          <DialogHeader>
            <DialogTitle>Withhold {fullName}&apos;s results?</DialogTitle>
            <DialogDescription>
              {fullName} will see none of their results, including those already
              published, until you lift the hold. They are shown the reason.{" "}
              {feeNote}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FormField id="withhold-preset" label="Reason">
              {(control) => (
                <NativeSelect
                  {...control}
                  className="w-full"
                  {...form.register("preset")}
                >
                  <NativeSelectOption value="fees">
                    {OUTSTANDING_FEES_REASON}
                  </NativeSelectOption>
                  <NativeSelectOption value="other">
                    Another reason
                  </NativeSelectOption>
                </NativeSelect>
              )}
            </FormField>
            {preset === "other" && (
              <FormField
                id="withhold-other"
                label="Describe the reason"
                error={errors.other?.message}
              >
                {(control) => (
                  <Textarea {...control} rows={2} {...form.register("other")} />
                )}
              </FormField>
            )}
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Withholding…" : "Withhold results"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
