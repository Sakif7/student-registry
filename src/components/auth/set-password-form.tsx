"use client";

// Chooses a password with the token from an emailed link: to activate a new
// account, or to replace a forgotten password. Either way the link works
// once, and setting the password signs the account out everywhere.
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  LINK_HOURS,
  MIN_PASSWORD_LENGTH,
  type NewPasswordInput,
  newPasswordSchema,
} from "@/domain/accounts";
import { authClient } from "@/lib/auth-client";

/** Why the password is being set: a new account, or a forgotten password. */
export type PasswordPurpose = "activate" | "reset";

export function SetPasswordForm({
  token,
  purpose,
}: {
  token: string;
  purpose: PasswordPurpose;
}) {
  const [outcome, setOutcome] = useState<"saved" | "expired">();
  const [problem, setProblem] = useState<string>();
  const form = useForm({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirmation: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function save({ password }: NewPasswordInput) {
    setProblem(undefined);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    if (error) {
      if (error.code === "INVALID_TOKEN") setOutcome("expired");
      else {
        setProblem(
          "Saving your password didn't work. Check your connection and try again.",
        );
      }
      return;
    }
    setOutcome("saved");
  }

  if (outcome === "expired") return <ExpiredLink purpose={purpose} />;
  if (outcome === "saved") {
    return (
      <div className="grid gap-6">
        <Alert>
          <AlertTitle>
            {purpose === "activate"
              ? "Your account is ready"
              : "Your password has changed"}
          </AlertTitle>
          <AlertDescription>
            Sign in with your email address and the password you just chose.
          </AlertDescription>
        </Alert>
        <Link href="/login" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <Form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void form.handleSubmit(save)(event)}
    >
      {problem && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <FormField
          id="password"
          label={purpose === "activate" ? "Password" : "New password"}
          description={`At least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words make a password that is strong and easy to remember.`}
          error={errors.password?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
          )}
        </FormField>
        <FormField
          id="confirmation"
          label="Type it again"
          error={errors.confirmation?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              {...form.register("confirmation")}
            />
          )}
        </FormField>
      </FieldGroup>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? "Saving…"
          : purpose === "activate"
            ? "Activate my account"
            : "Change my password"}
      </Button>
    </Form>
  );
}

/** Shown for a link that has expired or has already been used. */
export function ExpiredLink({ purpose }: { purpose: PasswordPurpose }) {
  return (
    <div className="grid gap-6">
      <Alert variant="destructive">
        <AlertTitle>This link no longer works</AlertTitle>
        <AlertDescription>
          {purpose === "activate" ? "Activation" : "Password reset"} links work
          once, for {LINK_HOURS} hours. Ask for a new link with your email
          address{purpose === "activate" ? ", or ask the Registry" : ""}.
        </AlertDescription>
      </Alert>
      <Link href="/forgot-password" className={buttonVariants()}>
        Ask for a new link
      </Link>
    </div>
  );
}
