// The "Fees and payments" section of a record page. Students see their
// account read-only; staff also get the forms to charge fees and record
// payments.
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { addDays, type CalendarDate } from "@/domain/college-time";
import { DEFAULT_FEE_DUE_DAYS } from "@/domain/fees";
import type { Account } from "@/server/services/fees";

import { AccountFigures, ChargesTable, PaymentsTable } from "./account-tables";
import { AssignFeeForm } from "./assign-fee-form";
import { RecordPaymentForm } from "./record-payment-form";

export function AccountSection({
  account,
  timeZone,
  staff,
}: {
  account: Account;
  timeZone: string;
  /** Present for staff, who can change the account. */
  staff?: { today: CalendarDate; academicYears: string[] };
}) {
  return (
    <section aria-labelledby="fees-heading" className="mt-10 grid gap-6">
      <h2 id="fees-heading" className="text-xl font-semibold tracking-tight">
        Fees and payments
      </h2>

      {staff && account.currentYearUncharged && (
        <Alert>
          <AlertTitle>No fee charged for {account.academicYear}</AlertTitle>
          <AlertDescription>
            This student has no tuition fee for their current academic year.
            Charge it below.
          </AlertDescription>
        </Alert>
      )}

      <AccountFigures account={account} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
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
              <ChargesTable account={account} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>Payments</h3>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentsTable account={account} timeZone={timeZone} />
            </CardContent>
          </Card>
        </div>

        {staff && (
          <div className="grid content-start gap-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h3>Record a payment</h3>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RecordPaymentForm
                  studentNumber={account.studentNumber}
                  today={staff.today}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h3>Charge a fee</h3>
                </CardTitle>
                <CardDescription>
                  One tuition fee per academic year.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AssignFeeForm
                  studentNumber={account.studentNumber}
                  academicYears={staff.academicYears}
                  defaultAcademicYear={account.academicYear}
                  standardFeePence={account.standardFeePence}
                  defaultDueDate={addDays(staff.today, DEFAULT_FEE_DUE_DAYS)}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}
