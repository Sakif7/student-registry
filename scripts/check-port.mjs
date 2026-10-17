// Runs before `npm run dev`: checks that the app's port is free. Sign-in only
// accepts requests from the address in BETTER_AUTH_URL, so the app must run
// on that address's port. If another program holds it, Next.js would start
// on the next free port instead, where every sign-in would be refused.
import { existsSync } from "node:fs";
import { createServer } from "node:net";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));

const probe = createServer();
probe.once("error", (error) => {
  if (error.code !== "EADDRINUSE") throw error;
  console.error(
    `\nPort ${port} is in use by another program. Stop it, or run the app on another port: set BETTER_AUTH_URL=http://localhost:3001 in .env, then run npm run dev -- -p 3001.\n`,
  );
  process.exit(1);
});
probe.listen(port, () => probe.close());
