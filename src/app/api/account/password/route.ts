// Changes the signed-in user's password: POST {"currentPassword", "password",
// "confirmation"}. Signs them out on every other device.
import { handle, json, readJson } from "@/server/http";
import { changePassword } from "@/server/services/account";

export const POST = handle(async (request, _context, session) =>
  json(await changePassword(session, await readJson(request))),
);
