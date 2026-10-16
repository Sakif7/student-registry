// The form behind an emailed password link, or the "no longer works" notice
// when Better Auth sent the visitor here with an error instead of a token.
import {
  ExpiredLink,
  type PasswordPurpose,
  SetPasswordForm,
} from "@/components/auth/set-password-form";
import { firstValues } from "@/server/pages";

export async function PasswordLinkForm({
  searchParams,
  purpose,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  purpose: PasswordPurpose;
}) {
  const { token, error } = firstValues(await searchParams);
  if (!token || error) return <ExpiredLink purpose={purpose} />;
  return <SetPasswordForm token={token} purpose={purpose} />;
}
