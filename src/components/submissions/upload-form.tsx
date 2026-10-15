"use client";

// Uploads a student's work for an assessment. The file's name and size are
// checked here first, so obvious mistakes show at once; the server checks
// everything again, including what the file really contains.
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";

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

const ACCEPT = Object.values(ACCEPTED_DOCUMENTS)
  .flatMap((document) => [document.extension, document.mimeType])
  .join(",");

export function UploadForm({
  assessmentId,
  resubmission,
  late,
}: {
  assessmentId: string;
  /** The upload replaces work already submitted. */
  resubmission: boolean;
  /** The deadline has passed, so the work will be marked late. */
  late: boolean;
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
      await apiRequest(
        "PUT",
        `/api/assessments/${assessmentId}/submission`,
        body,
      );
      toast.success(
        resubmission
          ? "Your work has been replaced."
          : late
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
    <form
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
    </form>
  );
}
