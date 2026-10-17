// Badges for assessments and submissions. The label carries the meaning, not
// the colour.
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import {
  ASSESSMENT_STATE_LABELS,
  type AssessmentState,
} from "@/domain/submissions";

const STATE_TONES: Record<AssessmentState, string> = {
  OPEN: "bg-emerald-100 text-emerald-900",
  ACCEPTING_LATE: "bg-amber-100 text-amber-900",
  CLOSED: "bg-neutral-200 text-neutral-800",
};

/** Open, Past deadline or Closed. */
export function AssessmentStateBadge({ state }: { state: AssessmentState }) {
  return (
    <Badge className={cn("border-transparent", STATE_TONES[state])}>
      {ASSESSMENT_STATE_LABELS[state]}
    </Badge>
  );
}

/** Marks work submitted after the deadline. */
export function LateBadge() {
  return (
    <Badge className="border-transparent bg-red-100 text-red-900">Late</Badge>
  );
}
