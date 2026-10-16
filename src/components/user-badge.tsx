// Who is signed in, with the sign-out button.
import { currentSession } from "@/server/session";

import { SignOutButton } from "./auth/sign-out-button";

export async function UserBadge() {
  const session = await currentSession();
  if (!session) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">{session.name}</span>
        {session.role === "staff"
          ? " · Registry staff"
          : ` · ${session.studentNumber}`}
      </span>
      <SignOutButton />
    </span>
  );
}
