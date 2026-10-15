"use client";

// Lifts a hold on a student's results. Marks published before the hold
// become visible to the student again straight away.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

export function LiftHoldButton({
  studentNumber,
  fullName,
}: {
  studentNumber: string;
  fullName: string;
}) {
  const [lifting, setLifting] = useState(false);

  async function lift() {
    setLifting(true);
    try {
      await apiRequest("DELETE", `/api/students/${studentNumber}/results/hold`);
      toast.success(`Hold lifted for ${fullName}.`);
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
