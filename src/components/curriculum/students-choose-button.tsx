"use client";

// Lets students choose their own optional modules for an academic year, or
// stops them, with Undo. Only that is sent: the semester dates stay as the
// server has them, even if a colleague changed them after this page opened.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { academicYearSlug } from "@/domain/academic-year";
import { ApiError, apiRequest } from "@/lib/api-client";
import { toastWithUndo } from "@/lib/undo";
import { refreshAfterWrite } from "@/server/actions";

export function StudentsChooseButton({
  year,
  choosing,
}: {
  year: string;
  /** Whether students choose their own options in the year now. */
  choosing: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const save = (studentsChooseModules: boolean) =>
    apiRequest("PATCH", `/api/academic-years/${academicYearSlug(year)}`, {
      studentsChooseModules,
    });
  const open = !choosing;
  const opened = `Students can now choose their own options for ${year}.`;
  const closed = `Students no longer choose their own options for ${year}.`;

  async function toggle() {
    setSaving(true);
    try {
      await save(open);
      toastWithUndo(open ? opened : closed, {
        run: () => save(!open),
        done: open ? closed : opened,
      });
      await refreshAfterWrite();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={saving}
      onClick={() => void toggle()}
    >
      {open ? "Let students choose" : "Stop students choosing"}
    </Button>
  );
}
