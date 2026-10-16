// The student's fees at a glance: where the account stands, what is left to
// pay, anything overdue, and the next payment due.
import { StandingBadge } from "@/components/fees/standing-badge";
import { nextChargeDue } from "@/domain/fees";
import { formatDate, formatMoney } from "@/lib/format";
import type { Account } from "@/server/services/fees";

export function FeesSummary({ account }: { account: Account }) {
  const { summary } = account;
  const next = nextChargeDue(account.charges);
  return (
    <div className="grid justify-items-start gap-1.5">
      <StandingBadge standing={account.standing} />
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {summary.balancePence > 0
          ? `${formatMoney(summary.balancePence)} to pay`
          : summary.balancePence < 0
            ? `${formatMoney(-summary.balancePence)} in credit`
            : "Nothing to pay"}
      </p>
      {summary.overdueSince && (
        <p className="text-sm text-red-900">
          {formatMoney(summary.overduePence)} overdue since{" "}
          {formatDate(summary.overdueSince)}. Please pay it as soon as you can,
          or contact the Registry.
        </p>
      )}
      {next && (
        <p className="text-sm text-muted-foreground">
          Next: {formatMoney(next.outstandingPence)} due on{" "}
          {formatDate(next.dueDate)}.
        </p>
      )}
    </div>
  );
}
