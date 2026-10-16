// Signing out, from the browser. Better Auth deletes the session on the
// server and clears the cookie; then a full page load, rather than a
// client-side navigation, shows the sign-in page, so the router's cache of
// the signed-in pages goes too, and replacing the history entry keeps Back
// from returning to them.
import { authClient } from "./auth-client";

export async function signOut(): Promise<void> {
  await authClient.signOut();
  window.location.replace("/login");
}
