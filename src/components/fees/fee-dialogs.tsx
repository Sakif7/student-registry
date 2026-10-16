"use client";

// The fee actions on a student's record, each in a dialog: recording a
// payment, and charging a fee for an academic year.
import { FormDialog } from "@/components/forms/form-dialog";
import type { CalendarDate } from "@/domain/college-time";

import { AssignFeeForm } from "./assign-fee-form";
import { RecordPaymentForm } from "./record-payment-form";

export function RecordPaymentDialog({
  studentNumber,
  today,
}: {
  studentNumber: string;
  today: CalendarDate;
}) {
  return (
    <FormDialog
      label="Record a payment"
      title="Record a payment"
      description="Money received from or for the student. Payments clear the oldest charge first."
      variant="default"
    >
      {(close) => (
        <RecordPaymentForm
          studentNumber={studentNumber}
          today={today}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

export function ChargeFeeDialog({
  studentNumber,
  academicYears,
  defaultAcademicYear,
  standardFeePence,
  defaultDueDate,
}: {
  studentNumber: string;
  academicYears: string[];
  defaultAcademicYear: string;
  standardFeePence: number;
  defaultDueDate: CalendarDate;
}) {
  return (
    <FormDialog
      label="Charge a fee"
      title="Charge a fee"
      description="One tuition fee per academic year."
    >
      {(close) => (
        <AssignFeeForm
          studentNumber={studentNumber}
          academicYears={academicYears}
          defaultAcademicYear={defaultAcademicYear}
          standardFeePence={standardFeePence}
          defaultDueDate={defaultDueDate}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}
