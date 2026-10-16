// The home address sends each person to their own area: Registry staff to the
// dashboard, a student to their home page, and anyone signed out to sign in.
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { currentSession } from "@/server/session";

export default function HomePage() {
  return (
    <Suspense>
      <SendHome />
    </Suspense>
  );
}

async function SendHome(): Promise<never> {
  const session = await currentSession();
  redirect(session ? `/${session.role}` : "/login");
}
