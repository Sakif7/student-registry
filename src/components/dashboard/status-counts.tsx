// How many students are in each enrolment status. Each count links to the
// student list filtered to that status.
import Link from "next/link";

import {
  ENROLMENT_STATUS_LABELS,
  ENROLMENT_STATUSES,
  type EnrolmentStatus,
} from "@/domain/enrolment";

export function StatusCounts({
  counts,
  total,
}: {
  counts: Record<EnrolmentStatus, number>;
  total: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <li>
        <CountLink href="/staff/students" label="All students" count={total} />
      </li>
      {ENROLMENT_STATUSES.map((status) => (
        <li key={status}>
          <CountLink
            href={`/staff/students?status=${status}`}
            label={ENROLMENT_STATUS_LABELS[status]}
            count={counts[status]}
          />
        </li>
      ))}
    </ul>
  );
}

function CountLink({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="block text-sm text-muted-foreground">{label}</span>
      <span className="block text-3xl font-semibold tabular-nums">{count}</span>
    </Link>
  );
}
