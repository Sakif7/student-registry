// The "Results" section of a staff record page: every mark and whether it is
// published, with the controls to publish or withhold results. The student's
// fee standing sits next to the controls, because unpaid fees are the usual
// reason to withhold results; withholding is still a decision staff make.
import { StandingBadge } from "@/components/fees/standing-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ACCOUNT_STANDING_LABELS } from "@/domain/fees";
import { formatDateOf, formatMoney } from "@/lib/format";
import type { Account } from "@/server/services/fees";
import type { StudentResults } from "@/server/services/results";

import { LiftHoldButton } from "./lift-hold-button";
import { PublishResultsButton } from "./publish-results-button";
import { ResultsTable } from "./results-table";
import { WithholdResultsDialog } from "./withhold-results-dialog";

export function ResultsSection({
  results,
  fullName,
  account,
  timeZone,
  className,
}: {
  results: StudentResults;
  fullName: string;
  account: Account;
  timeZone: string;
  className?: string;
}) {
  const { studentNumber, withheld } = results;
  const unpublished = results.results.filter((r) => !r.publishedAt).length;
  const overdue = account.summary.overduePence;
  const feeNote =
    overdue > 0
      ? `Fees: ${formatMoney(overdue)} overdue.`
      : `Fees: ${ACCOUNT_STANDING_LABELS[account.standing].toLowerCase()}.`;

  return (
    <section aria-label="Results" className={`grid gap-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Results</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 flex items-center gap-2 text-sm">
            Fees <StandingBadge standing={account.standing} />
            {overdue > 0 && (
              <span className="text-red-900">
                {formatMoney(overdue)} overdue
              </span>
            )}
          </span>
          {withheld ? (
            <LiftHoldButton
              studentNumber={studentNumber}
              fullName={fullName}
              reason={withheld.reason}
            />
          ) : (
            <>
              <WithholdResultsDialog
                studentNumber={studentNumber}
                fullName={fullName}
                feeNote={feeNote}
              />
              {unpublished > 0 && (
                <PublishResultsButton
                  studentNumber={studentNumber}
                  fullName={fullName}
                  unpublishedCount={unpublished}
                />
              )}
            </>
          )}
        </div>
      </div>

      {withheld && (
        <Alert variant="warning">
          <AlertTitle>
            Results withheld since {formatDateOf(withheld.since, timeZone)}
          </AlertTitle>
          <AlertDescription>
            Reason: {withheld.reason}. {fullName} sees the reason but no
            results, and marks can&apos;t be published until the hold is lifted.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Marks</h3>
          </CardTitle>
          <CardDescription>
            Latest assessment first. {fullName} sees a mark once it is
            published, unless their results are withheld.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {results.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No marks yet.</p>
          ) : (
            <>
              <ResultsTable
                results={results.results}
                timeZone={timeZone}
                staff
              />
              {!withheld && unpublished === 0 && (
                <p className="text-sm text-muted-foreground">
                  Every mark is published.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
