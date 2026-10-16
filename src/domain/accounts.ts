// Sign-in accounts: the password rules, and the shape of the sign-in and
// password forms. Better Auth enforces the same limits on the server.
import { z } from "zod";

/**
 * Passwords need length rather than character rules, as NIST guidance
 * recommends: a long passphrase beats a short password with symbols.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address")
    .pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
});

/** A new password, typed twice. */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Use at least ${MIN_PASSWORD_LENGTH} characters`,
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `Use ${MAX_PASSWORD_LENGTH} characters or fewer`,
      ),
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ["confirmation"],
    error: "The passwords don't match",
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
