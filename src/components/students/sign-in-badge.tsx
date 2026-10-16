// Where a student's sign-in account stands, as a badge: Active, Waiting for
// activation, or Turned off. The label carries the meaning, not the colour.
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { SIGN_IN_STATE_LABELS, type SignInState } from "@/domain/accounts";

const TONES: Record<SignInState, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-900",
  PENDING: "bg-amber-100 text-amber-900",
  DISABLED: "bg-muted text-muted-foreground",
};

export function SignInBadge({ state }: { state: SignInState }) {
  return (
    <Badge className={cn("border-transparent", TONES[state])}>
      {SIGN_IN_STATE_LABELS[state]}
    </Badge>
  );
}
