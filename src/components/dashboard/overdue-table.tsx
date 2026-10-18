// The overdue worklist: every student with fees unpaid after the due date,
// longest overdue first.
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDays, formatMoney } from "@/lib/format";
import type { OverdueAccount } from "@/server/services/dashboard";

export function OverdueTable({
  accounts,
  totalPence,
}: {
  accounts: OverdueAccount[];
  totalPence: number;
}) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">No overdue fees.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every charge past its due date has been paid.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-3">
        {accounts.length === 1
          ? "1 student owes"
          : `${accounts.length} students owe`}{" "}
        <strong>{formatMoney(totalPence)}</strong> in total past the due date.
      </p>
      <Table>
        <TableCaption className="sr-only">
          Students with overdue fees, longest overdue first
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Programme</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Overdue</TableHead>
            {/* Set apart from the amount, which ends against it. */}
            <TableHead className="pl-8">Was due</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.studentNumber}>
              <TableCell>
                <Link
                  href={`/staff/students/${account.studentNumber}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {account.fullName}
                </Link>
                <div className="font-mono text-xs text-muted-foreground">
                  {account.studentNumber}
                </div>
              </TableCell>
              <TableCell className="min-w-36 whitespace-normal">
                {account.programmeTitle}
              </TableCell>
              <TableCell>
                <StatusBadge status={account.status} />
              </TableCell>
              <TableCell className="text-right font-medium text-red-900 tabular-nums">
                {formatMoney(account.overduePence)}
              </TableCell>
              <TableCell className="pl-8">
                {formatDate(account.overdueSince)}
                <div className="text-xs text-muted-foreground">
                  {formatDays(account.daysOverdue)} overdue
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(account.balancePence)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
