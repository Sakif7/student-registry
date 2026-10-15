// Downloads a submitted file, for staff or the student who submitted it. It
// is always sent as an attachment, never displayed inline.
import { download, handle } from "@/server/http";
import { getSubmissionFile } from "@/server/services/submissions";

type Context = RouteContext<"/api/submissions/[submissionId]/file">;

export const GET = handle<Context>(async (_request, { params }, session) => {
  const { submissionId } = await params;
  const file = await getSubmissionFile(session, submissionId);
  return download(file.bytes, file.fileName, file.mimeType);
});
