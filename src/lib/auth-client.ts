// Better Auth's browser client, for the sign-in, sign-out, password and
// session forms. It calls this site's /api/auth endpoints.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
