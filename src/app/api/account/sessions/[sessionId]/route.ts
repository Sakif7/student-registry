// Signs the signed-in user out on one of their other devices.
import { handle } from "@/server/http";
import { signOutDevice } from "@/server/services/account";

type Context = RouteContext<"/api/account/sessions/[sessionId]">;

export const DELETE = handle<Context>(async (_request, { params }, session) => {
  const { sessionId } = await params;
  await signOutDevice(session, sessionId);
  return new Response(null, { status: 204 });
});
