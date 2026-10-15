// The signed-in student's submission for an assessment. PUT uploads a PDF or
// Word document as multipart/form-data in the field "file": 201 for a first
// submission, 200 when it replaces an earlier one (allowed until the
// deadline).
import { MAX_UPLOAD_BYTES } from "@/domain/submissions";
import { AppError } from "@/server/errors";
import { handle, json, readFormData } from "@/server/http";
import { requireStudent } from "@/server/session";
import { submitWork } from "@/server/services/submissions";

type Context = RouteContext<"/api/assessments/[assessmentId]/submission">;

// Room for the multipart boundaries and part headers around the file.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const PUT = handle<Context>(async (request, { params }, session) => {
  const { assessmentId } = await params;
  // Checked again by submitWork; checking first avoids reading the upload of
  // someone who may not submit at all.
  requireStudent(session);
  const form = await readFormData(
    request,
    MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES,
    "The file is larger than 10 MB.",
  );
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new AppError("VALIDATION", "Choose a file to upload.", {
      file: ["Choose a file to upload"],
    });
  }
  const { submission, replaced } = await submitWork(
    session,
    assessmentId,
    file,
  );
  return json({ submission }, replaced ? 200 : 201);
});
