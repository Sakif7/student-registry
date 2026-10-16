"use client";

// Closes an assessment to submissions, after a confirmation, or reopens it.
// Closing stops students submitting or replacing work, so it asks first;
// reopening only restores what was there, so it doesn't. Either can be
// undone from its confirmation.
import { useState } from "react";
import { toast } from "sonner";

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
import { ApiError, apiRequest } from "@/lib/api-client";
import { toastWithUndo } from "@/lib/undo";
import { refreshAfterWrite } from "@/server/actions";

export function ClosureControl({
  assessmentId,
  closed,
}: {
  assessmentId: string;
  closed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = (value: boolean) =>
    apiRequest("PATCH", `/api/assessments/${assessmentId}`, { closed: value });

  async function setClosed(value: boolean) {
    setSaving(true);
    try {
      await patch(value);
      const closedMessage = "Closed to submissions.";
      const reopenedMessage = "Reopened to submissions.";
      toastWithUndo(value ? closedMessage : reopenedMessage, {
        run: () => patch(!value),
        done: value ? reopenedMessage : closedMessage,
      });
      setOpen(false);
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (closed) {
    return (
      <Button
        variant="outline"
        disabled={saving}
        onClick={() => void setClosed(false)}
      >
        {saving ? "Reopening…" : "Reopen to submissions"}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        Close to submissions
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close to submissions?</DialogTitle>
          <DialogDescription>
            Students will no longer be able to submit or replace work, even
            late. Work already submitted is kept. You can reopen the assessment
            later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={saving} onClick={() => void setClosed(true)}>
            {saving ? "Closing…" : "Close to submissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
