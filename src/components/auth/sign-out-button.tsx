"use client";

// Signs out: Better Auth deletes the session on the server and clears the
// cookie. Then a full page load, rather than a client-side navigation, shows
// the sign-in page: the router's cache of the signed-in pages goes with it,
// and replacing the history entry keeps Back from returning to them.
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    window.location.replace("/login");
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={signingOut}
      onClick={() => void signOut()}
    >
      {signingOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}
