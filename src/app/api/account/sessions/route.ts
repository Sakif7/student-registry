// The devices the signed-in user is signed in on. GET lists them, this one
// first; DELETE signs out every one but this.
import { handle, json } from "@/server/http";
import { listDevices, signOutOtherDevices } from "@/server/services/account";

export const GET = handle(async (_request, _context, session) =>
  json({ devices: await listDevices(session) }),
);

export const DELETE = handle(async (_request, _context, session) =>
  json(await signOutOtherDevices(session)),
);
