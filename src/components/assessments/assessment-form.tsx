"use client";

// Sets an assessment for a module. The deadline is typed in the college's time
// zone and checked here with the API's own rules; the API converts it to an
// instant and checks it again.
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { WallTime } from "@/domain/college-time";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";
import type { ModuleOption } from "@/server/services/assessments";

interface AssessmentValues {
  moduleCode: string;
  title: string;
  deadline: string;
}

export function AssessmentForm({
  modules,
  timeZone,
  now,
}: {
  modules: ModuleOption[];
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
      onSubmit={(event) => void form.handleSubmit(save)(event)}
    >
      <FieldGroup>
        <FormField
          id="moduleCode"
          label="Module"
          description="Students enrolled on the module's programme can submit."
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
              {groupByProgramme(modules).map(([programme, options]) => (
                <NativeSelectOptGroup key={programme} label={programme}>
                  {options.map((option) => (
                    <NativeSelectOption key={option.code} value={option.code}>
                      {option.code} {option.title}
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

/** Modules grouped under their programme, keeping the order given. */
function groupByProgramme(modules: ModuleOption[]): [string, ModuleOption[]][] {
  const groups = new Map<string, ModuleOption[]>();
  for (const option of modules) {
    const group = groups.get(option.programme.title) ?? [];
    group.push(option);
    groups.set(option.programme.title, group);
  }
  return [...groups];
}
