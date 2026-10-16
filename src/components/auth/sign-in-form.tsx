"use client";

// The sign-in form, and the demo accounts when they are shown. A wrong email
// and a wrong password get the same message, so the form never reveals which
// addresses have accounts.
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type SignInInput, signInSchema } from "@/domain/accounts";
import { authClient } from "@/lib/auth-client";
import type { DemoAccount } from "@/lib/demo-accounts";
import { useHydrated } from "@/lib/use-hydrated";

export function SignInForm({
  next,
  demo,
}: {
  /** Where to go once signed in. */
  next: string;
  demo?: { accounts: readonly DemoAccount[]; password: string };
}) {
  const [problem, setProblem] = useState<string>();
  // Set once signed in, so the button stays disabled while the page loads.
  const [signedIn, setSignedIn] = useState(false);
  const form = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const hydrated = useHydrated();

  async function signIn(values: SignInInput) {
    setProblem(undefined);
    const { error } = await authClient.signIn.email(values);
    if (error) {
      setProblem(signInProblem(error));
      return;
    }
    setSignedIn(true);
    // A full page load, so everything renders for the new session, replacing
    // the sign-in page in the history.
    window.location.replace(next);
  }

  return (
    <div className="grid gap-6">
      <Form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => void form.handleSubmit(signIn)(event)}
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
          <FormField
            id="password"
            label="Password"
            error={errors.password?.message}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="current-password"
                {...form.register("password")}
              />
            )}
          </FormField>
        </FieldGroup>
        <Button type="submit" disabled={isSubmitting || signedIn}>
          {isSubmitting || signedIn ? "Signing in…" : "Sign in"}
        </Button>
        <Link
          href="/forgot-password"
          className="justify-self-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Forgot your password?
        </Link>
      </Form>

      {demo && demo.accounts.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              <h2>Demo accounts</h2>
            </CardTitle>
            <CardDescription>
              Every demo account&apos;s password is{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {demo.password}
              </code>
              . Choose one to fill in the form.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Like the form, unavailable until React can handle a choice. */}
            <ul
              className="grid gap-2"
              aria-disabled={hydrated ? undefined : true}
            >
              {demo.accounts.map((account) => (
                <li
                  key={account.email}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {account.name}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {account.role === "staff" ? "Staff" : "Student"}
                      </span>
                    </p>
                    <p className="truncate text-muted-foreground">
                      {account.note}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      form.setValue("email", account.email);
                      form.setValue("password", demo.password);
                      setProblem(undefined);
                    }}
                  >
                    Use<span className="sr-only"> {account.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function signInProblem({
  status,
  code,
  message,
}: {
  status: number;
  code?: string;
  message?: string;
}): string {
  // Too many failed attempts with this email address: the message says for
  // how long.
  if (code === "SIGN_IN_LOCKED" && message) return message;
  if (status === 429) {
    return "Too many sign-in attempts. Wait a minute, then try again.";
  }
  // Raised for a disabled account, after the password has been checked.
  if (status === 403 && message) return message;
  if (status === 401) return "The email address or password is incorrect.";
  return "Signing in didn't work. Check your connection and try again.";
}
