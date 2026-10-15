// A student's account in detail: the headline figures, each fee charge with
// what has been paid towards it, and every payment (reversed ones included).
import { cn } from "cn";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatDateTime,
  formatDays,
  formatMoney,
} from "@/lib/format";
import type { Account } from "@/server/services/fees";

import { StandingBadge } from "./standing-badge";

/** The headline figures: charged, paid, balance (or credit) and overdue. */
export function AccountFigures({ account }: { account: Account }) {
  const { summary } = account;
  const figures: [string, ReactNode, string?][] = [
    ["Charged", formatMoney(summary.chargedPence)],
    ["Paid", formatMoney(summary.paidPence)],
    summary.balancePence < 0
      ? ["In credit", formatMoney(-summary.balancePence)]
      : ["Balance", formatMoney(summary.balancePence)],
    summary.overduePence > 0
      ? [
          "Overdue",
          formatMoney(summary.overduePence),
          `since ${summary.overdueSince ? formatDate(summary.overdueSince) : ""} (${formatDays(summary.daysOverdue)})`,
        ]
      : ["Overdue", "Nothing overdue"],
  ];
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Account</span>
        <StandingBadge standing={account.standing} />
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {figures.map(([label, value, detail]) => {
          const flagged = label === "Overdue" && summary.overduePence > 0;
          return (
            <div
              key={label}
              className={cn(
                "rounded-lg border p-3",
                flagged && "border-red-200 bg-red-50",
              )}
            >
              {/* Muted grey is too faint on the red tint, so dark red. */}
              <dt
                className={cn(
                  "text-sm",
                  flagged ? "text-red-900" : "text-muted-foreground",
                )}
              >
                {label}
              </dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              {detail && <dd className="text-xs text-red-900">{detail}</dd>}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** Fee charges, oldest due date first, with what is paid of each. */
export function ChargesTable({
  account,
  actions,
}: {
  account: Account;
  /** Extra controls per charge, e.g. correcting it (staff only). */
  actions?: (charge: Account["charges"][number]) => ReactNode;
}) {
  if (account.charges.length === 0) {
    return <p className="text-muted-foreground">No fees have been charged.</p>;
  }
  return (
    <Table>
      <TableCaption className="sr-only">Fee charges</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead>Charge</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Due</TableHead>
          <TableHead className="text-right">Outstanding</TableHead>
          <TableHead>State</TableHead>
          {actions && (
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {account.charges.map((charge) => (
          <TableRow key={charge.id}>
            <TableCell>{charge.academicYear}</TableCell>
            <TableCell className="whitespace-normal">
              {charge.description}
              {charge.note && (
                <div className="text-xs text-muted-foreground">
                  {charge.note}
                </div>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(charge.amountPence)}
            </TableCell>
            <TableCell>{formatDate(charge.dueDate)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(charge.outstandingPence)}
            </TableCell>
            <TableCell>
              {charge.overdue ? (
                <Badge className="border-transparent bg-red-100 text-red-900">
                  Overdue
                </Badge>
              ) : charge.outstandingPence > 0 ? (
                <Badge className="border-transparent bg-amber-100 text-amber-900">
                  Due
                </Badge>
              ) : (
                <Badge className="border-transparent bg-emerald-100 text-emerald-900">
                  Paid
                </Badge>
              )}
            </TableCell>
            {actions && <TableCell>{actions(charge)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Every payment, newest first; reversed ones stay visible but don't count. */
export function PaymentsTable({
  account,
  timeZone,
  actions,
}: {
  account: Account;
  timeZone: string;
  /** Extra controls per payment, e.g. reversing it (staff only). */
  actions?: (payment: Account["payments"][number]) => ReactNode;
}) {
  if (account.payments.length === 0) {
    return <p className="text-muted-foreground">No payments recorded.</p>;
  }
  return (
    <Table>
      <TableCaption className="sr-only">Payments</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Paid on</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Recorded</TableHead>
          <TableHead>State</TableHead>
          {actions && (
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {account.payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell>{formatDate(payment.paidOn)}</TableCell>
            <TableCell className="font-mono text-xs">
              {payment.reference}
            </TableCell>
            <TableCell
              className={cn(
                "text-right tabular-nums",
                payment.reversal && "text-muted-foreground line-through",
              )}
            >
              {formatMoney(payment.amountPence)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDateTime(payment.recordedAt, timeZone)}
            </TableCell>
            <TableCell className="whitespace-normal">
              {payment.reversal ? (
                <>
                  <Badge className="border-transparent bg-zinc-200 text-zinc-800">
                    Reversed
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    {payment.reversal.reason}
                  </div>
                </>
              ) : (
                <Badge className="border-transparent bg-emerald-100 text-emerald-900">
                  Received
                </Badge>
              )}
            </TableCell>
            {actions && <TableCell>{actions(payment)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
