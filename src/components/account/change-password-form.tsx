"use client";

// Changes the signed-in user's password. The new one is typed twice, and
// changing it signs them out on every other device.
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type ChangePasswordInput,
  changePasswordSchema,
  MIN_PASSWORD_LENGTH,
} from "@/domain/accounts";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

export function ChangePasswordForm({ email }: { email: string }) {
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmation: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function save(values: ChangePasswordInput) {
    try {
      const { signedOutDevices } = await apiRequest<{
        signedOutDevices: number;
      }>("POST", "/api/account/password", values);
      toast.success("Password changed.", {
        description:
          signedOutDevices === 0
            ? undefined
            : `Signed out on ${signedOutDevices} other ${signedOutDevices === 1 ? "device" : "devices"}.`,
      });
      form.reset();
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Form
      noValidate
      className="grid max-w-md gap-4"
      onSubmit={(event) => void form.handleSubmit(save)(event)}
    >
      {/* Tells password managers whose password this is. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <FieldGroup>
        <FormField
          id="currentPassword"
          label="Current password"
          error={errors.currentPassword?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="current-password"
              {...form.register("currentPassword")}
            />
          )}
        </FormField>
        <FormField
          id="password"
          label="New password"
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
      <Button
        type="submit"
        className="justify-self-start"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Changing…" : "Change password"}
      </Button>
    </Form>
  );
}
