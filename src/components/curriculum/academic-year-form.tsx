"use client";

// Sets up or changes an academic year's calendar: the dates of its two
// semesters, and whether students may choose their own optional modules.
import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Form } from "@/components/forms/form";
import { FormDialogFooter } from "@/components/forms/form-dialog";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { academicYearSlug } from "@/domain/academic-year";
import type { CalendarDate } from "@/domain/college-time";
import {
  type AcademicYearSettingsInput,
  academicYearSettingsSchema,
  type SemesterDates,
} from "@/domain/curriculum";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

const DATE_FIELDS = [
  ["semester1Start", "Semester 1 starts"],
  ["semester1End", "Semester 1 ends"],
  ["semester2Start", "Semester 2 starts"],
  ["semester2End", "Semester 2 ends"],
] as const satisfies readonly (readonly [keyof SemesterDates, string])[];

export function AcademicYearForm({
  year,
  calendar,
  today,
  onDone,
}: {
  /** E.g. "2027/28". */
  year: string;
  /** Its calendar now, if it has one. */
  calendar?: SemesterDates & { studentsChooseModules: boolean };
  /** The college's date: a date before it has passed, so stays as it is. */
  today: CalendarDate;
  onDone: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(academicYearSettingsSchema(year)),
    defaultValues: calendar ?? {
      semester1Start: "",
      semester1End: "",
      semester2Start: "",
      semester2End: "",
      studentsChooseModules: false,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const studentsChoose = useWatch({
    control: form.control,
    name: "studentsChooseModules",
  });

  async function save(settings: AcademicYearSettingsInput) {
    try {
      await apiRequest(
        "PUT",
        `/api/academic-years/${academicYearSlug(year)}`,
        settings,
      );
      toast.success(calendar ? `${year} saved.` : `${year} is set up.`);
      await refreshAfterWrite();
      onDone();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void form.handleSubmit(save)(event)}
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          {DATE_FIELDS.map(([name, label]) => {
            // A date that has passed can't change, and none can move into
            // the past (semesterDateProblems). A year set up late may start
            // in the past, so a new calendar has no such limits.
            const passed = calendar !== undefined && calendar[name] < today;
            return (
              <FormField
                key={name}
                id={name}
                label={label}
                description={
                  passed ? "Passed, so it stays as it is" : undefined
                }
                error={errors[name]?.message}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    className="w-fit"
                    readOnly={passed}
                    min={calendar && !passed ? today : undefined}
                    {...form.register(name)}
                  />
                )}
              </FormField>
            );
          })}
        </div>
        <ChooseModulesField
          checked={studentsChoose === true}
          onChange={(checked) =>
            form.setValue("studentsChooseModules", checked)
          }
        />
      </FieldGroup>
      <FormDialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving…"
            : calendar
              ? "Save changes"
              : `Set up ${year}`}
        </Button>
      </FormDialogFooter>
    </Form>
  );
}

function ChooseModulesField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  // Not a fixed id: a page hidden by client navigation stays in the document.
  const descriptionId = useId();
  return (
    <div className="grid gap-1">
      <label className="flex items-center gap-3 text-sm font-medium">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onChange(value === true)}
          aria-describedby={descriptionId}
        />
        Students choose their own optional modules
      </label>
      <p id={descriptionId} className="pl-7 text-sm text-muted-foreground">
        While this is on, students can add and drop their own options, within
        the credits their year carries.
      </p>
    </div>
  );
}
