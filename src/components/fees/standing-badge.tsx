// The state of a student's account as a badge: Overdue, Balance due, Paid in
// full, In credit or No fees. The label carries the meaning, not the colour.
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { ACCOUNT_STANDING_LABELS, type AccountStanding } from "@/domain/fees";

const TONES: Record<AccountStanding, string> = {
  OVERDUE: "bg-red-100 text-red-900",
  DUE: "bg-amber-100 text-amber-900",
  PAID: "bg-emerald-100 text-emerald-900",
  CREDIT: "bg-sky-100 text-sky-900",
  NONE: "bg-zinc-100 text-zinc-700",
};

export function StandingBadge({ standing }: { standing: AccountStanding }) {
  return (
    <Badge className={cn("border-transparent", TONES[standing])}>
      {ACCOUNT_STANDING_LABELS[standing]}
    </Badge>
  );
}
