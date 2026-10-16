// Everything done to a student's record, newest first, and by whom: the
// student's part of the audit trail.
import { Actor } from "@/components/activity/activity-log";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { ActivityEntry } from "@/server/services/activity";

export function HistoryCard({
  entries,
  timeZone,
}: {
  entries: ActivityEntry[];
  timeZone: string;
}) {
  return (
    <section aria-label="History">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>History</h2>
          </CardTitle>
          <CardDescription>
            Every change to this record, newest first, and who made it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet.
            </p>
          ) : (
            <ol className="grid gap-3 text-sm">
              {entries.map((entry) => (
                <li key={entry.id} className="grid gap-0.5">
                  <p>{entry.description}</p>
                  <p className="text-muted-foreground">
                    {formatDateTime(entry.occurredAt, timeZone)} ·{" "}
                    <Actor entry={entry} />
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
