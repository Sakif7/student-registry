"use client";

// A student's sign-in account on their record, for staff: where it stands,
// emailing an activation or password-reset link, and turning sign-in off
// (after a confirmation, with an undo) or back on.
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SIGN_IN_STATE_LABELS, type SignInState } from "@/domain/accounts";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

/** A student's sign-in account, with its dates formatted for display. */
export interface SignInSummary {
  email: string;
  state: SignInState;
  activatedOn: string | null;
  disabledOn: string | null;
  link: { sentAt: string; expiresAt: string } | null;
  devices: number;
}

const BADGE_CLASSES: Record<SignInState, string> = {
  ACTIVE: "border-transparent bg-emerald-100 text-emerald-900",
  PENDING: "border-transparent bg-amber-100 text-amber-900",
  DISABLED: "border-transparent bg-muted text-muted-foreground",
};

export function SignInCard({
  studentNumber,
  fullName,
  signIn,
}: {
  studentNumber: string;
  fullName: string;
  signIn: SignInSummary;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  const sendLink = () =>
    act(async () => {
      const { link } = await apiRequest<{
        link: { kind: "activation" | "reset"; to: string };
      }>("POST", `/api/students/${studentNumber}/sign-in/link`);
      toast.success(
        link.kind === "activation"
          ? `Activation email sent to ${link.to}.`
          : `Password reset email sent to ${link.to}.`,
      );
    });

  const setEnabled = (enabled: boolean) =>
    apiRequest("PATCH", `/api/students/${studentNumber}/sign-in`, { enabled });

  const turnOff = () =>
    act(async () => {
      await setEnabled(false);
      setConfirming(false);
      toast.success(`Sign-in turned off for ${fullName}.`, {
        action: {
          label: "Undo",
          onClick: () =>
            void act(async () => {
              await setEnabled(true);
              toast.success(`Sign-in turned back on for ${fullName}.`);
            }),
        },
      });
    });

  const turnOn = () =>
    act(async () => {
      await setEnabled(true);
      toast.success(`Sign-in turned back on for ${fullName}.`);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <h2>Sign-in</h2>
          <Badge className={BADGE_CLASSES[signIn.state]}>
            {SIGN_IN_STATE_LABELS[signIn.state]}
          </Badge>
        </CardTitle>
        <CardDescription>
          Signs in with <span className="break-all">{signIn.email}</span>, the
          email address on this record.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <p>{describe(signIn, fullName)}</p>
        <div className="flex flex-wrap gap-2">
          {signIn.state === "DISABLED" ? (
            <Button disabled={busy} onClick={() => void turnOn()}>
              Turn sign-in back on
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void sendLink()}
              >
                {signIn.state === "ACTIVE"
                  ? "Email a password reset link"
                  : signIn.link
                    ? "Resend activation email"
                    : "Send activation email"}
              </Button>
              <Dialog open={confirming} onOpenChange={setConfirming}>
                <DialogTrigger render={<Button variant="outline" />}>
                  Turn sign-in off
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Turn sign-in off for {fullName}?</DialogTitle>
                    <DialogDescription>
                      {fullName} will be signed out on every device straight
                      away, and won&apos;t be able to sign in until you turn it
                      back on. Any emailed link stops working.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      Cancel
                    </DialogClose>
                    <Button disabled={busy} onClick={() => void turnOff()}>
                      Turn sign-in off
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function describe(signIn: SignInSummary, fullName: string): string {
  if (signIn.state === "DISABLED") {
    return `Turned off on ${signIn.disabledOn ?? "an unknown date"}. ${fullName} can't sign in.`;
  }
  if (signIn.state === "ACTIVE") {
    const devices =
      signIn.devices === 0
        ? "Not signed in at the moment."
        : `Signed in on ${signIn.devices} ${signIn.devices === 1 ? "device" : "devices"} now.`;
    return `Activated on ${signIn.activatedOn ?? "an unknown date"}. ${devices}`;
  }
  return signIn.link
    ? `Waiting for ${fullName} to choose a password. The activation email went on ${signIn.link.sentAt}; its link works until ${signIn.link.expiresAt}.`
    : `Waiting for ${fullName} to choose a password, and no activation link is waiting. Send one to let them in.`;
}
