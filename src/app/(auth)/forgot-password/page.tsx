// Ask for a link to choose a new password, by email.
import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot your password?" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Forgot your password?
      </h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Enter the email address you sign in with, and we&apos;ll email you a
        link to choose a new password.
      </p>
      <ForgotPasswordForm />
    </>
  );
}
