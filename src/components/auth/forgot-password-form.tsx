"use client";

// Asks for a link to choose a new password. The answer is the same whether
// or not an account uses the address, so the form never reveals who has one.
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
  type ForgotPasswordInput,
  forgotPasswordSchema,
  LINK_HOURS,
} from "@/domain/accounts";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function requestLink({ email }: ForgotPasswordInput) {
    setProblem(undefined);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    if (error) {
      setProblem(
        error.status === 429
          ? "Too many requests from your network. Wait a minute, then try again."
          : "Sending the link didn't work. Check your connection and try again.",
      );
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="grid gap-6">
        <Alert>
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            If an account uses {sentTo}, we&apos;ve emailed it a link to choose
            a new password. The link works once, for {LINK_HOURS} hours. Nothing
            there? Check your spam folder, or ask the Registry.
          </AlertDescription>
        </Alert>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <Form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void form.handleSubmit(requestLink)(event)}
    >
      {problem && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <FormField id="email" label="Email" error={errors.email?.message}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="username"
              {...form.register("email")}
            />
          )}
        </FormField>
      </FieldGroup>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Email me a link"}
      </Button>
      <Link
        href="/login"
        className="justify-self-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </Form>
  );
}
