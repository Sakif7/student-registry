// How many students are in each enrolment status. Each count links to the
// student list filtered to that status.
import {
  ENROLMENT_STATUS_LABELS,
  ENROLMENT_STATUSES,
  type EnrolmentStatus,
} from "@/domain/enrolment";

import { CountLink } from "./count-link";

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
