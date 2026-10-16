"use client";

// Charges a student the fee for an academic year. The amount starts as the
// programme's standard fee; changing it (e.g. for a scholarship) needs a note.
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { calendarDateSchema } from "@/domain/college-time";
import { assignFeeSchema } from "@/domain/fees";
import {
  chargeAmountSchema,
  penceToPoundsInput,
  poundsField,
} from "@/domain/money";
import { ApiError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { refreshAfterWrite } from "@/server/actions";

export function AssignFeeForm({
  studentNumber,
  academicYears,
  defaultAcademicYear,
  standardFeePence,
  defaultDueDate,
  onDone,
}: {
  studentNumber: string;
  academicYears: string[];
  defaultAcademicYear: string;
  standardFeePence: number;
  defaultDueDate: string;
  /** Called once the fee is charged, e.g. to close a dialog. */
  onDone?: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(
      assignFeeSchema
        .extend({
          amountPence: poundsField(chargeAmountSchema),
          dueDate: calendarDateSchema,
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
      academicYear: defaultAcademicYear,
      amountPence: penceToPoundsInput(standardFeePence),
      dueDate: defaultDueDate,
      note: "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function save(fee: {
    academicYear: string;
    amountPence: number;
    dueDate: string;
    note?: string | undefined;
  }) {
    try {
      await apiRequest("POST", `/api/students/${studentNumber}/fees`, fee);
      toast.success(
        `Fee of ${formatMoney(fee.amountPence)} charged for ${fee.academicYear}.`,
      );
      await refreshAfterWrite();
      onDone?.();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Form noValidate onSubmit={(event) => void form.handleSubmit(save)(event)}>
      <FieldGroup>
        <FormField
          id="feeAcademicYear"
          label="Academic year"
          error={errors.academicYear?.message}
        >
          {(control) => (
            <NativeSelect {...control} {...form.register("academicYear")}>
              {academicYears.map((year) => (
                <NativeSelectOption key={year} value={year}>
                  {year}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="feeAmount"
          label="Amount (£)"
          description={`Standard fee: ${formatMoney(standardFeePence)} a year.`}
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
          id="feeDueDate"
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
          id="feeNote"
          label="Note"
          description="Required if the amount differs from the standard fee, e.g. a scholarship."
          error={errors.note?.message}
        >
          {(control) => (
            <Textarea {...control} rows={2} {...form.register("note")} />
          )}
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? "Charging…" : "Charge fee"}
        </Button>
      </FieldGroup>
    </Form>
  );
}
