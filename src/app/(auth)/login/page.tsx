// Sign in with an email address and password. Nobody signs up here: staff
// accounts come from the seed, and a student's account from their enrolment.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";
import { DEMO_LOGINS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { safeNextPath } from "@/lib/safe-redirect";
import { env } from "@/server/env";
import { firstValues } from "@/server/pages";
import { currentSession } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Use the email address the Registry has for you.
      </p>
      <Suspense fallback={<Skeleton className="h-72" />}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignIn({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const next = safeNextPath(firstValues(await searchParams).next);
  // Someone already signed in goes straight on.
  if (await currentSession()) redirect(next);
  return (
    <SignInForm
      next={next}
      demo={
        env().SHOW_DEMO_ACCOUNTS
          ? { accounts: DEMO_LOGINS, password: DEMO_PASSWORD }
          : undefined
      }
    />
  );
}
