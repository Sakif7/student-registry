"use client";

// Sets an assessment for a module. Staff choose a programme first, and then
// one of its modules, year by year, so it is clear which modules belong to
// which programme. The programme only narrows the choice: an assessment is
// for every student registered on the module, whichever programme they are
// on. The deadline is typed in the college's time zone and checked here with
// the API's own rules; the API converts it to an instant and checks it again.
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { assessmentFormSchema } from "@/domain/assessments";
import { MODULE_KIND_LABELS, SEMESTER_LABELS } from "@/domain/curriculum";
import type { WallTime } from "@/domain/college-time";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";
import type { ProgrammeModules } from "@/server/services/assessments";

interface AssessmentValues {
  moduleCode: string;
  title: string;
  deadline: string;
}

export function AssessmentForm({
  programmes,
  timeZone,
  now,
}: {
  /** Every programme, with its modules year by year. */
  programmes: ProgrammeModules[];
  timeZone: string;
  /** The college's current wall-clock time, the earliest deadline offered. */
  now: WallTime;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(assessmentFormSchema(timeZone)),
    defaultValues: { moduleCode: "", title: "", deadline: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const [programmeCode, setProgrammeCode] = useState("");
  const [programmeError, setProgrammeError] = useState<string>();
  const programme = programmes.find(({ code }) => code === programmeCode);
  const years = [
    ...new Set(programme?.modules.map(({ yearOfStudy }) => yearOfStudy)),
  ];

  function chooseProgramme(event: ChangeEvent<HTMLSelectElement>) {
    setProgrammeCode(event.currentTarget.value);
    setProgrammeError(undefined);
    // The module chosen belonged to the programme before.
    form.setValue("moduleCode", "");
  }

  async function save(values: AssessmentValues) {
    try {
      const { assessment } = await apiRequest<{
        assessment: { id: string; title: string };
      }>("POST", "/api/assessments", values);
      toast.success(`Assessment set: ${assessment.title}`);
      await refreshAfterWrite();
      router.push(`/staff/assessments/${assessment.id}`);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Form
      noValidate
      className="max-w-xl"
      onSubmit={(event) =>
        void form.handleSubmit(save, () => {
          if (!programme) setProgrammeError("Choose a programme");
        })(event)
      }
    >
      <FieldGroup>
        <FormField
          id="programme"
          label="Programme"
          description="Its modules are listed below, year by year."
          error={programmeError}
        >
          {(control) => (
            <NativeSelect
              {...control}
              className="w-full"
              value={programmeCode}
              onChange={chooseProgramme}
            >
              <NativeSelectOption value="" disabled>
                Choose a programme
              </NativeSelectOption>
              {programmes.map((option) => (
                <NativeSelectOption key={option.code} value={option.code}>
                  {option.title} ({option.code})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField
          id="moduleCode"
          label="Module"
          description="Students registered on the module for the deadline's academic year can submit, whichever programme they are on."
          error={errors.moduleCode?.message}
        >
          {(control) => (
            <NativeSelect
              {...control}
              className="w-full"
              disabled={!programme}
              {...form.register("moduleCode")}
            >
              <NativeSelectOption value="" disabled>
                {programme ? "Choose a module" : "Choose a programme first"}
              </NativeSelectOption>
              {years.map((year) => (
                <NativeSelectOptGroup key={year} label={`Year ${year}`}>
                  {programme?.modules
                    .filter(({ yearOfStudy }) => yearOfStudy === year)
                    .map((option) => (
                      <NativeSelectOption key={option.code} value={option.code}>
                        {option.code} {option.title} (
                        {SEMESTER_LABELS[option.semester]},{" "}
                        {MODULE_KIND_LABELS[option.kind].toLowerCase()})
                      </NativeSelectOption>
                    ))}
                </NativeSelectOptGroup>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField id="title" label="Title" error={errors.title?.message}>
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              {...form.register("title")}
            />
          )}
        </FormField>

        <FormField
          id="deadline"
          label="Deadline"
          description={`In college time (${timeZone}). Work submitted after the deadline is accepted but marked late.`}
          error={errors.deadline?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="datetime-local"
              min={now}
              className="w-fit"
              {...form.register("deadline")}
            />
          )}
        </FormField>

        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Set assessment"}
          </Button>
          <Link
            href="/staff/assessments"
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        </div>
      </FieldGroup>
    </Form>
  );
}
