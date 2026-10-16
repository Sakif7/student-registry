// Activate a new account by choosing its password, from the link in the
// activation email the Registry sends at enrolment. The link passes through
// Better Auth, which checks the token and adds it here, or adds an error
// instead if the link has expired or been used.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PasswordLinkForm } from "@/components/auth/password-link-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Activate your account" };

export default function ActivatePage({ searchParams }: PageProps<"/activate">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Activate your account
      </h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Choose a password to finish setting up your Student Registry account.
      </p>
      <Suspense fallback={<Skeleton className="h-56" />}>
        <PasswordLinkForm searchParams={searchParams} purpose="activate" />
      </Suspense>
    </>
  );
}
