// The "Fees and payments" section of a record page. Students see their
// account read-only; staff can also record payments and charge fees (each in
// a dialog), and correct charges and reverse payments.
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CalendarDate } from "@/domain/college-time";
import type { Account } from "@/server/services/fees";

import { AccountFigures, ChargesTable, PaymentsTable } from "./account-tables";
import { CorrectFeeDialog } from "./correct-fee-dialog";
import { ChargeFeeDialog, RecordPaymentDialog } from "./fee-dialogs";
import { ReversePaymentDialog } from "./reverse-payment-dialog";

export function AccountSection({
  account,
  timeZone,
  staff,
  className,
}: {
  account: Account;
  timeZone: string;
  /** Present for staff, who can change the account. */
  staff?: { today: CalendarDate; academicYears: string[] };
  className?: string;
}) {
  return (
    <section
      aria-label="Fees and payments"
      className={`grid gap-6 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Fees and payments
        </h2>
        {staff && (
          <div className="flex flex-wrap gap-2">
            <RecordPaymentDialog
              studentNumber={account.studentNumber}
              today={staff.today}
            />
            <ChargeFeeDialog
              studentNumber={account.studentNumber}
              academicYears={staff.academicYears}
              defaultAcademicYear={account.academicYear}
              standardFeePence={account.standardFeePence}
              today={staff.today}
            />
          </div>
        )}
      </div>

      {staff && account.currentYearUncharged && (
        <Alert variant="warning">
          <AlertTitle>No fee charged for {account.academicYear}</AlertTitle>
          <AlertDescription>
            This student has no tuition fee for their current academic year.
            Charge it with “Charge a fee”.
          </AlertDescription>
        </Alert>
      )}

      <AccountFigures account={account} />

      <div className="grid gap-6">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Fees charged</h3>
              </CardTitle>
              <CardDescription>
                Payments clear the oldest charge first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChargesTable
                account={account}
                actions={
                  staff &&
                  ((charge) => (
                    <CorrectFeeDialog
                      charge={charge}
                      // The fee it was raised at, not the programme's now.
                      standardFeePence={charge.standardFeePence}
                    />
                  ))
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Payments</h3>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentsTable
                account={account}
                timeZone={timeZone}
                actions={
                  staff &&
                  ((payment) =>
                    payment.reversal ? null : (
                      <ReversePaymentDialog payment={payment} />
                    ))
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
