// An enrolment status as a coloured badge. The label carries the meaning, so
// colour is never the only cue.
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import {
  ENROLMENT_STATUS_LABELS,
  type EnrolmentStatus,
} from "@/domain/enrolment";

const TONES: Record<EnrolmentStatus, string> = {
  ENROLLED: "bg-emerald-100 text-emerald-900",
  DEFERRED: "bg-amber-100 text-amber-900",
  WITHDRAWN: "bg-zinc-200 text-zinc-800",
  COMPLETED: "bg-sky-100 text-sky-900",
};

export function StatusBadge({ status }: { status: EnrolmentStatus }) {
  return (
    <Badge className={cn("border-transparent", TONES[status])}>
      {ENROLMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
