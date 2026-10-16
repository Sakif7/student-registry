"use client";

// Lets students choose their own optional modules for an academic year, or
// stops them, with Undo. The calendar's dates go with it unchanged.
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { academicYearSlug } from "@/domain/academic-year";
import type { SemesterDates } from "@/domain/curriculum";
import { ApiError, apiRequest } from "@/lib/api-client";
import { toastWithUndo } from "@/lib/undo";
import { refreshAfterWrite } from "@/server/actions";

export function StudentsChooseButton({
  year,
  calendar,
}: {
  year: string;
  calendar: SemesterDates & { studentsChooseModules: boolean };
}) {
  const [saving, setSaving] = useState(false);
  const save = (studentsChooseModules: boolean) =>
    apiRequest("PUT", `/api/academic-years/${academicYearSlug(year)}`, {
      ...calendar,
      studentsChooseModules,
    });
  const open = !calendar.studentsChooseModules;
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
