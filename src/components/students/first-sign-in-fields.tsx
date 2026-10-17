"use client";

// How a newly enrolled student first signs in: an emailed activation link,
// in which they choose a password, or a password staff set now, so the
// student can sign in straight away. In the demo, the password starts as the
// demo password, so a new student can be tried at once without opening the
// emails.
import { type Ref, useId } from "react";

import { FormField } from "@/components/forms/form-field";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MIN_PASSWORD_LENGTH } from "@/domain/accounts";

export interface DemoSignIn {
  /** The demo password, which the password field starts with. */
  password: string;
  /** Where the demo's emails can be read. */
  inboxUrl: string;
}

export function FirstSignInFields({
  sendLink,
  onSendLinkChange,
  password,
  onPasswordChange,
  error,
  passwordRef,
  demo,
}: {
  sendLink: boolean;
  onSendLinkChange: (sendLink: boolean) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  error?: string;
  passwordRef: Ref<HTMLInputElement>;
  demo?: DemoSignIn;
}) {
  const switchDescriptionId = useId();
  return (
    <FieldSet>
      <FieldLegend>Sign-in</FieldLegend>
      <div className="grid gap-1">
        <label className="flex items-center gap-3 text-sm font-medium">
          <Switch
            checked={sendLink}
            onCheckedChange={(checked) => onSendLinkChange(checked)}
            aria-describedby={switchDescriptionId}
          />
          Send an activation link
        </label>
        <p
          id={switchDescriptionId}
          className="pl-11 text-sm text-muted-foreground"
        >
          {sendLink ? (
            <>
              The student chooses a password from an emailed link.
              {demo && (
                <>
                  {" "}
                  Here, emails arrive in Mailpit at{" "}
                  <a
                    href={demo.inboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    {demo.inboxUrl.replace(/^https?:\/\//, "")}
                  </a>
                  .
                </>
              )}
            </>
          ) : (
            "You set the student's password now, and they can sign in straight away."
          )}
        </p>
      </div>
      {!sendLink && (
        <FormField
          id="password"
          label="Password"
          description={
            demo && password === demo.password
              ? "This is the demo password, so you can sign in as the student straight away. They can change it on their account page."
              : `At least ${MIN_PASSWORD_LENGTH} characters. Give it to the student, who can change it on their account page.`
          }
          error={error}
        >
          {(control) => (
            <Input
              {...control}
              ref={passwordRef}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          )}
        </FormField>
      )}
    </FieldSet>
  );
}
