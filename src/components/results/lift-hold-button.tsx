"use client";

// Lifts a hold on a student's results. Marks published before the hold
// become visible to the student again straight away. Undo puts the hold
// back, with the same reason.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, apiRequest } from "@/lib/api-client";
import { toastWithUndo } from "@/lib/undo";
import { refreshAfterWrite } from "@/server/actions";

export function LiftHoldButton({
  studentNumber,
  fullName,
  reason,
}: {
  studentNumber: string;
  fullName: string;
  /** Why the results are withheld, to put the hold back on Undo. */
  reason: string;
}) {
  const [lifting, setLifting] = useState(false);
  const hold = `/api/students/${studentNumber}/results/hold`;

  async function lift() {
    setLifting(true);
    try {
      await apiRequest("DELETE", hold);
      toastWithUndo(`Hold lifted for ${fullName}.`, {
        run: () => apiRequest("PUT", hold, { reason }),
        done: `Results withheld again for ${fullName}.`,
      });
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setLifting(false);
    }
  }

  return (
    <Button variant="outline" disabled={lifting} onClick={() => void lift()}>
      {lifting ? "Lifting…" : "Lift the hold"}
    </Button>
  );
}
