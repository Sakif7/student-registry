// Who is signed in, linking to their account page, with the sign-out button.
import Link from "next/link";

import { currentSession } from "@/server/session";

import { SignOutButton } from "./auth/sign-out-button";

export async function UserBadge() {
  const session = await currentSession();
  if (!session) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-muted-foreground">
        <Link
          href={`/${session.role}/account`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {session.name}
        </Link>
        {session.role === "staff"
          ? " · Registry staff"
          : ` · ${session.studentNumber}`}
      </span>
      <SignOutButton />
    </span>
  );
}
