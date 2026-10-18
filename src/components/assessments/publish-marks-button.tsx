"use client";

// Publishes an assessment's waiting marks to all its students at once, after
// a confirmation: each student sees their mark straight away, and there is
// no unpublishing. Marks of students whose results are withheld stay
// unpublished.
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
import { formatCount } from "@/lib/format";
import { refreshAfterWrite } from "@/server/actions";

export function PublishMarksButton({
  assessmentId,
  title,
  waitingCount,
  withheldCount,
  size = "default",
}: {
  assessmentId: string;
  title: string;
  /** Saved marks not yet published, of students whose results aren't withheld. */
  waitingCount: number;
  /** Students with a mark waiting whose results are withheld. */
  withheldCount: number;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const marks = formatCount(waitingCount, "mark");

  async function publish() {
    setPublishing(true);
    try {
      // The marks this dialog counted: if a colleague has saved another
      // since, nothing is published unseen.
      const { published } = await apiRequest<{ published: number }>(
        "POST",
        `/api/assessments/${assessmentId}/publication`,
        { expected: waitingCount },
      );
      toast.success(
        `Published ${formatCount(published, "mark")} for ${title}.`,
      );
      setOpen(false);
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={size} />}>
        Publish {marks}
        <span className="sr-only"> for {title}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Publish {marks} for {title}?
          </DialogTitle>
          <DialogDescription>
            Each student sees their mark straight away. A mark changed later
            becomes unpublished again until you publish once more.
            {withheldCount > 0 &&
              ` ${withheldCount === 1 ? "One student's results are" : `${withheldCount} students' results are`} withheld, so ${withheldCount === 1 ? "that mark stays" : "those marks stay"} unpublished.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={publishing} onClick={() => void publish()}>
            {publishing ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
