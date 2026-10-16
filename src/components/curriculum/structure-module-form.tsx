"use client";

// Adds a module to a year of a programme, as core (every student in the
// year takes it) or optional (students choose).
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Form } from "@/components/forms/form";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  MODULE_KIND_LABELS,
  MODULE_KINDS,
  type Semester,
  SEMESTER_LABELS,
  structureEntrySchema,
} from "@/domain/curriculum";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

// The API's rules, with the year as a select sends it.
const formSchema = structureEntrySchema.extend({
  yearOfStudy: z.coerce.number().pipe(structureEntrySchema.shape.yearOfStudy),
});

export function StructureModuleForm({
  programmeCode,
  years,
  modules,
  onDone,
}: {
  programmeCode: string;
  years: number;
  /** Modules not yet part of the programme. */
  modules: readonly {
    code: string;
    title: string;
    credits: number;
    semester: Semester;
  }[];
  onDone: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { moduleCode: "", yearOfStudy: 1, kind: "CORE" as const },
  });
  const { errors, isSubmitting } = form.formState;

  async function save(entry: z.output<typeof formSchema>) {
    try {
      await apiRequest(
        "POST",
        `/api/programmes/${programmeCode}/modules`,
        entry,
      );
      toast.success(
        `Added ${entry.moduleCode} to year ${entry.yearOfStudy}, as ${MODULE_KIND_LABELS[entry.kind].toLowerCase()}.`,
      );
      await refreshAfterWrite();
      onDone();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  return (
    <Form noValidate onSubmit={(event) => void form.handleSubmit(save)(event)}>
      <FieldGroup>
        <FormField
          id="moduleCode"
          label="Module"
          error={errors.moduleCode?.message}
        >
          {(control) => (
            <NativeSelect
              {...control}
              className="w-full"
              {...form.register("moduleCode")}
            >
              <NativeSelectOption value="" disabled>
                Choose a module
              </NativeSelectOption>
              {modules.map((module) => (
                <NativeSelectOption key={module.code} value={module.code}>
                  {module.code} {module.title} ({module.credits} credits,{" "}
                  {SEMESTER_LABELS[module.semester]})
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="yearOfStudy"
            label="Year of study"
            error={errors.yearOfStudy?.message}
          >
            {(control) => (
              <NativeSelect {...control} {...form.register("yearOfStudy")}>
                {Array.from({ length: years }, (_, index) => (
                  <NativeSelectOption key={index} value={index + 1}>
                    Year {index + 1}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id="kind"
            label="Core or optional"
            error={errors.kind?.message}
          >
            {(control) => (
              <NativeSelect {...control} {...form.register("kind")}>
                {MODULE_KINDS.map((kind) => (
                  <NativeSelectOption key={kind} value={kind}>
                    {MODULE_KIND_LABELS[kind]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
        <p className="text-sm text-muted-foreground">
          Every student in the year takes a core module; students choose among
          the optional ones. Students already registered for the year keep their
          modules.
        </p>
        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? "Adding…" : "Add module"}
        </Button>
      </FieldGroup>
    </Form>
  );
}
