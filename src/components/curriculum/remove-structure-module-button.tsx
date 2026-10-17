"use client";

// Takes a module out of a programme's structure. Students' registrations
// stay, so it asks for no confirmation; Undo puts the module back, in the
// same year and as core or optional again.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ModuleKind } from "@/domain/curriculum";
import { ApiError, apiRequest } from "@/lib/api-client";
import { toastWithUndo } from "@/lib/undo";
import { refreshAfterWrite } from "@/server/actions";

export function RemoveStructureModuleButton({
  programmeCode,
  moduleCode,
  yearOfStudy,
  kind,
}: {
  programmeCode: string;
  moduleCode: string;
  yearOfStudy: number;
  kind: ModuleKind;
}) {
  const [removing, setRemoving] = useState(false);

  async function remove() {
    setRemoving(true);
    try {
      await apiRequest(
        "DELETE",
        `/api/programmes/${programmeCode}/modules/${moduleCode}`,
      );
      toastWithUndo(`Removed ${moduleCode} from year ${yearOfStudy}.`, {
        run: () =>
          apiRequest("POST", `/api/programmes/${programmeCode}/modules`, {
            moduleCode,
            yearOfStudy,
            kind,
          }),
        done: `Put ${moduleCode} back in year ${yearOfStudy}.`,
      });
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="xs"
      disabled={removing}
      onClick={() => void remove()}
    >
      Remove<span className="sr-only"> {moduleCode}</span>
    </Button>
  );
}
