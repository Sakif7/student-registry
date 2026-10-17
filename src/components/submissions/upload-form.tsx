"use client";

// Uploads a student's work for an assessment. The file's name and size are
// checked here first, so obvious mistakes show at once; the server checks
// everything again, including what the file really contains.
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCEPTED_DOCUMENTS,
  FILE_PROBLEM_MESSAGES,
  precheckFile,
} from "@/domain/submissions";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";
import type { OwnSubmission } from "@/server/services/submissions";

const ACCEPT = Object.values(ACCEPTED_DOCUMENTS)
  .flatMap((document) => [document.extension, document.mimeType])
  .join(",");

export function UploadForm({
  assessmentId,
  resubmission,
}: {
  assessmentId: string;
  /** The upload replaces work already submitted. */
  resubmission: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);

  function refuse(message: string) {
    setError(message);
    input.current?.focus();
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) {
      refuse("Choose a file to upload");
      return;
    }
    const problem = precheckFile(file);
    if (problem) {
      refuse(FILE_PROBLEM_MESSAGES[problem]);
      return;
    }

    setError(undefined);
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    try {
      // The server's verdict, not the page's: the deadline may have passed
      // since the page was opened.
      const { submission } = await apiRequest<{
        submission: Pick<OwnSubmission, "attempt" | "late">;
      }>("PUT", `/api/assessments/${assessmentId}/submission`, body);
      toast.success(
        submission.attempt > 1
          ? "Your work has been replaced."
          : submission.late
            ? "Your work has been submitted, marked late."
            : "Your work has been submitted.",
      );
      if (input.current) input.current.value = "";
      await refreshAfterWrite();
    } catch (failure) {
      if (!(failure instanceof ApiError)) throw failure;
      refuse(failure.fieldErrors.file?.[0] ?? failure.message);
      toast.error(failure.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void upload(event)}
    >
      <FormField
        id="file"
        label={resubmission ? "New file" : "Your work"}
        description="A PDF or Word document (.docx), up to 10 MB."
        error={error}
      >
        {(control) => (
          <Input {...control} ref={input} type="file" accept={ACCEPT} />
        )}
      </FormField>
      <Button type="submit" disabled={uploading} className="w-fit">
        {uploading
          ? "Uploading…"
          : resubmission
            ? "Replace my work"
            : "Submit my work"}
      </Button>
    </Form>
  );
}
