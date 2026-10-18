// The student's latest published marks, newest first, or why there are none
// to show. The server has already left out anything unpublished or withheld.
import { EmptyNote } from "@/components/dashboard/dashboard-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CLASSIFICATION_LABELS } from "@/domain/results";
import { formatDateOf } from "@/lib/format";
import type { StudentResults } from "@/server/services/results";

/** How many marks the card shows. */
const SHOWN = 3;

export function LatestResults({
  results,
  timeZone,
}: {
  results: StudentResults;
  timeZone: string;
}) {
  if (results.withheld) {
    // The same notice as on the Results page.
    return (
      <Alert variant="warning">
        <AlertDescription>
          Your results are being withheld: {results.withheld.reason}. Contact
          the Registry to resolve this.
        </AlertDescription>
      </Alert>
    );
  }
  const latest = results.results
    .flatMap(({ publishedAt, ...result }) =>
      publishedAt ? [{ ...result, publishedAt }] : [],
    )
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, SHOWN);
  if (latest.length === 0) {
    return (
      <EmptyNote>
        No results yet. Your marks appear here once they are published.
      </EmptyNote>
    );
  }
  return (
    <ul className="divide-y">
      {latest.map((result) => (
        <li
          key={result.assessment.id}
          className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{result.assessment.title}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{result.module.code}</span> ·{" "}
              {result.academicYear} · published{" "}
              {formatDateOf(result.publishedAt, timeZone)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{result.mark}</p>
            <p className="text-xs text-muted-foreground">
              {CLASSIFICATION_LABELS[result.classification]}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
