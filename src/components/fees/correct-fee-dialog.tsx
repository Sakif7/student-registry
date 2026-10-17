"use client";

// Corrects a fee charge's amount or due date, e.g. after a scholarship is
// awarded or a payment plan is agreed. An amount that differs from the
// standard fee needs a note saying why.
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { calendarDateSchema } from "@/domain/college-time";
import {
  chargeAmountSchema,
  penceToPoundsInput,
  poundsField,
} from "@/domain/money";
import { ApiError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { refreshAfterWrite } from "@/server/actions";
import type { FeeChargeView } from "@/server/services/fees";

export function CorrectFeeDialog({
  charge,
  standardFeePence,
}: {
  charge: FeeChargeView;
  standardFeePence: number;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(
      z
        .object({
          amountPence: poundsField(chargeAmountSchema),
          dueDate: calendarDateSchema,
          note: z.string().trim().max(200, "Use 200 characters or fewer"),
        })
        .superRefine((fee, ctx) => {
          if (fee.amountPence !== standardFeePence && !fee.note) {
            ctx.addIssue({
              code: "custom",
              path: ["note"],
              message: `Explain why the amount differs from the standard fee of ${formatMoney(standardFeePence)}`,
            });
          }
        }),
    ),
    defaultValues: {
      amountPence: penceToPoundsInput(charge.amountPence),
      dueDate: charge.dueDate,
      note: charge.note ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const idPrefix = `correct-${charge.id}`;

  async function save(values: {
    amountPence: number;
    dueDate: string;
    note: string;
  }) {
    try {
      await apiRequest("PATCH", `/api/fees/${charge.id}`, values);
      toast.success(`Fee for ${charge.academicYear} corrected.`);
      setOpen(false);
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="xs" />}>
        Correct
        <span className="sr-only"> the fee for {charge.academicYear}</span>
      </DialogTrigger>
      <DialogContent>
        <Form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => void form.handleSubmit(save)(event)}
        >
          <DialogHeader>
            <DialogTitle>Correct the fee for {charge.academicYear}</DialogTitle>
            <DialogDescription>
              Standard fee: {formatMoney(standardFeePence)} a year.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FormField
              id={`${idPrefix}-amount`}
              label="Amount (£)"
              error={errors.amountPence?.message}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  {...form.register("amountPence")}
                />
              )}
            </FormField>
            <FormField
              id={`${idPrefix}-due`}
              label="Due date"
              error={errors.dueDate?.message}
            >
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  className="w-fit"
                  {...form.register("dueDate")}
                />
              )}
            </FormField>
            <FormField
              id={`${idPrefix}-note`}
              label="Note"
              error={errors.note?.message}
            >
              {(control) => (
                <Textarea {...control} rows={2} {...form.register("note")} />
              )}
            </FormField>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save correction"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
