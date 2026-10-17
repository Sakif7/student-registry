// Any address under /api that no route matches: a problem-details 404, as
// the API's other errors are, rather than Next.js's HTML page. More specific
// routes, including Better Auth's under /api/auth, always match first.
import { AppError } from "@/server/errors";
import { handle } from "@/server/http";

const notFound = handle(() => {
  throw new AppError("NOT_FOUND", "There is no such address in this API.");
});

export {
  notFound as DELETE,
  notFound as GET,
  notFound as PATCH,
  notFound as POST,
  notFound as PUT,
};
