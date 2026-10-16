"use client";

// Adds an option to a student's year, or drops a module from it, for staff
// or for the student while they may choose. It says what it did, with Undo
// when the opposite request would be allowed.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, apiRequest } from "@/lib/api-client";
import { toastWithUndo } from "@/lib/undo";
import { refreshAfterWrite } from "@/server/actions";

export function RegistrationButton({
  studentNumber,
  moduleCode,
  action,
  undoable = true,
}: {
  studentNumber: string;
  moduleCode: string;
  action: "add" | "drop";
  /**
   * Whether Undo is offered: a module dropped from outside the student's
   * year couldn't be added back.
   */
  undoable?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const path = `/api/students/${studentNumber}/modules`;
  const add = () => apiRequest("POST", path, { moduleCode });
  const drop = () => apiRequest("DELETE", `${path}/${moduleCode}`);

  async function change() {
    setBusy(true);
    try {
      await (action === "add" ? add() : drop());
      const done = action === "add" ? "Added" : "Dropped";
      if (undoable) {
        toastWithUndo(`${done} ${moduleCode}.`, {
          run: action === "add" ? drop : add,
          done:
            action === "add"
              ? `Dropped ${moduleCode} again.`
              : `Added ${moduleCode} back.`,
        });
      } else {
        toast.success(`${done} ${moduleCode}.`);
      }
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={action === "add" ? "outline" : "ghost"}
      size="sm"
      disabled={busy}
      onClick={() => void change()}
    >
      {action === "add" ? "Add" : "Drop"}
      <span className="sr-only"> {moduleCode}</span>
    </Button>
  );
}
