"use client";

// Publishes all of a student's unpublished marks, after a confirmation: the
// student sees them straight away, and there is no unpublishing.
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
import { refreshAfterWrite } from "@/server/actions";

export function PublishResultsButton({
  studentNumber,
  fullName,
  unpublishedCount,
  size = "default",
}: {
  studentNumber: string;
  fullName: string;
  unpublishedCount: number;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const marks = unpublishedCount === 1 ? "mark" : "marks";

  async function publish() {
    setPublishing(true);
    try {
      // The marks this dialog counted: if a colleague has saved another
      // since, nothing is published unseen.
      const { published } = await apiRequest<{ published: number }>(
        "POST",
        `/api/students/${studentNumber}/results/publication`,
        { expected: unpublishedCount },
      );
      toast.success(
        `Published ${published} ${published === 1 ? "mark" : "marks"} to ${fullName}.`,
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
        Publish {unpublishedCount} {marks}
        <span className="sr-only"> to {fullName}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Publish {unpublishedCount} {marks} to {fullName}?
          </DialogTitle>
          <DialogDescription>
            {fullName} will see {unpublishedCount === 1 ? "it" : "them"}{" "}
            straight away. A mark changed later becomes unpublished again until
            you publish once more.
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
