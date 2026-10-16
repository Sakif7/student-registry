// Choose a new password, from the link in a password-reset email. The link
// passes through Better Auth, which checks the token and adds it here, or adds
// an error instead if the link has expired or been used.
import type { Metadata } from "next";
import { Suspense } from "react";

import { PasswordLinkForm } from "@/components/auth/password-link-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Choose a new password
      </h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        It replaces your old password, and signs you out on every device.
      </p>
      <Suspense fallback={<Skeleton className="h-56" />}>
        <PasswordLinkForm searchParams={searchParams} purpose="reset" />
      </Suspense>
    </>
  );
}
