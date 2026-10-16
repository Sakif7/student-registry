"use client";

// Records a payment against a student's account. The amount is typed in
// pounds; the page refreshes so the new balance shows immediately.
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CalendarDate } from "@/domain/college-time";
import { recordPaymentSchema } from "@/domain/fees";
import { paymentAmountSchema, poundsField } from "@/domain/money";
import { ApiError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { refreshAfterWrite } from "@/server/actions";
import type { Account } from "@/server/services/fees";

export function RecordPaymentForm({
  studentNumber,
  today,
}: {
  studentNumber: string;
  /** The college's date: the default and the latest allowed payment date. */
  today: CalendarDate;
}) {
  const blank = { amountPence: "", paidOn: today, reference: "" };
  const form = useForm({
    resolver: zodResolver(
      recordPaymentSchema(today).extend({
        amountPence: poundsField(paymentAmountSchema),
      }),
    ),
    defaultValues: blank,
  });
  const { errors, isSubmitting } = form.formState;

  async function save(payment: {
    amountPence: number;
    paidOn: string;
    reference: string;
  }) {
    try {
      const { account } = await apiRequest<{ account: Account }>(
        "POST",
        `/api/students/${studentNumber}/payments`,
        payment,
      );
      const balance = account.summary.balancePence;
      toast.success(
        `Payment of ${formatMoney(payment.amountPence)} recorded. ${
          balance < 0
            ? `In credit by ${formatMoney(-balance)}.`
            : `Balance now ${formatMoney(balance)}.`
        }`,
      );
      form.reset(blank);
      await refreshAfterWrite();
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
          id="amountPence"
          label="Amount (£)"
          error={errors.amountPence?.message}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              {...form.register("amountPence")}
            />
          )}
        </FormField>
        <FormField id="paidOn" label="Date paid" error={errors.paidOn?.message}>
          {(control) => (
            <Input
              {...control}
              type="date"
              max={today}
              className="w-fit"
              {...form.register("paidOn")}
            />
          )}
        </FormField>
        <FormField
          id="reference"
          label="Reference"
          description="The bank or receipt reference. Each can be recorded only once."
          error={errors.reference?.message}
        >
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              {...form.register("reference")}
            />
          )}
        </FormField>
        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? "Recording…" : "Record payment"}
        </Button>
      </FieldGroup>
    </Form>
  );
}
