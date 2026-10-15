"use client";

// Reverses a payment entered by mistake. The payment stays on record, marked
// reversed with the reason, and stops counting towards the balance.
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { reversePaymentSchema } from "@/domain/fees";
import { ApiError, apiRequest } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { refreshAfterWrite } from "@/server/actions";
import type { PaymentView } from "@/server/services/fees";

export function ReversePaymentDialog({ payment }: { payment: PaymentView }) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(reversePaymentSchema),
    defaultValues: { reason: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function reverse(values: { reason: string }) {
    try {
      await apiRequest("POST", `/api/payments/${payment.id}/reversal`, values);
      toast.success(`Payment ${payment.reference} reversed.`);
      setOpen(false);
      form.reset();
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="xs" />}>
        Reverse
        <span className="sr-only"> payment {payment.reference}</span>
      </DialogTrigger>
      <DialogContent>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => void form.handleSubmit(reverse)(event)}
        >
          <DialogHeader>
            <DialogTitle>Reverse payment {payment.reference}?</DialogTitle>
            <DialogDescription>
              {formatMoney(payment.amountPence)} paid on{" "}
              {formatDate(payment.paidOn)}. The payment stays on record but no
              longer counts towards the balance. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <FormField
            id={`reversal-reason-${payment.id}`}
            label="Reason"
            error={errors.reason?.message}
          >
            {(control) => (
              <Textarea {...control} rows={3} {...form.register("reason")} />
            )}
          </FormField>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Reversing…" : "Reverse payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
