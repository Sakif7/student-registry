"use client";

// Changes an assessment's title or deadline, e.g. to extend the deadline for
// everyone. Only the fields that changed are sent, so a title can be corrected
// after the deadline has passed without having to move the deadline.
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  assessmentTitleSchema,
  deadlineFieldSchema,
} from "@/domain/assessments";
import type { WallTime } from "@/domain/college-time";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

export function EditAssessmentDialog({
  assessmentId,
  title,
  deadline,
  timeZone,
  now,
}: {
  assessmentId: string;
  title: string;
  /** The current deadline as a wall-clock time in the college's time zone. */
  deadline: WallTime;
  timeZone: string;
  /** The college's current wall-clock time, the earliest deadline offered. */
  now: WallTime;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(
      z
        .object({ title: assessmentTitleSchema, deadline: z.string() })
        .superRefine((values, ctx) => {
          // An unchanged deadline isn't sent, so it may be in the past.
          if (values.deadline === deadline) return;
          const result = deadlineFieldSchema(timeZone).safeParse(
            values.deadline,
          );
          if (!result.success) {
            ctx.addIssue({
              code: "custom",
              path: ["deadline"],
              message: result.error.issues[0]?.message ?? "Enter a deadline",
            });
          }
        }),
    ),
    defaultValues: { title, deadline },
  });
  const { errors, isSubmitting } = form.formState;

  async function save(values: { title: string; deadline: string }) {
    const changes = {
      title: values.title === title ? undefined : values.title,
      deadline: values.deadline === deadline ? undefined : values.deadline,
    };
    if (changes.title === undefined && changes.deadline === undefined) {
      setOpen(false);
      return;
    }
    try {
      await apiRequest("PATCH", `/api/assessments/${assessmentId}`, changes);
      toast.success("Assessment updated.");
      setOpen(false);
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Start from the saved values each time the dialog opens.
        if (next) form.reset({ title, deadline });
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        Edit title or deadline
      </DialogTrigger>
      <DialogContent>
        <Form
          noValidate
          className="grid gap-4"
          onSubmit={(event) => void form.handleSubmit(save)(event)}
        >
          <DialogHeader>
            <DialogTitle>Edit assessment</DialogTitle>
            <DialogDescription>
              Moving the deadline applies to every student. Late flags follow
              the new deadline straight away.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FormField
              id="edit-title"
              label="Title"
              error={errors.title?.message}
            >
              {(control) => (
                <Input
                  {...control}
                  autoComplete="off"
                  {...form.register("title")}
                />
              )}
            </FormField>
            <FormField
              id="edit-deadline"
              label="Deadline"
              description={`In college time (${timeZone}).`}
              error={errors.deadline?.message}
            >
              {(control) => (
                <Input
                  {...control}
                  type="datetime-local"
                  min={now}
                  className="w-fit"
                  {...form.register("deadline")}
                />
              )}
            </FormField>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
