"use client";

// Sets up a module, or changes one: its title, credits and when it is
// taught. Its code is set once.
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Form } from "@/components/forms/form";
import { FormDialogFooter } from "@/components/forms/form-dialog";
import { FormField } from "@/components/forms/form-field";
import { applyServerErrors } from "@/components/forms/server-errors";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  createModuleSchema,
  type Semester,
  SEMESTER_LABELS,
  SEMESTERS,
} from "@/domain/curriculum";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

// The API's rules, with the credits as typed.
const formSchema = createModuleSchema.extend({
  credits: z.coerce.number().pipe(createModuleSchema.shape.credits),
});

export interface ModuleDetails {
  code: string;
  title: string;
  credits: number;
  semester: Semester;
}

export function ModuleForm({
  module,
  creditsLocked = false,
  onDone,
}: {
  /** The module to change; a new one is set up without it. */
  module?: ModuleDetails;
  /** Students are registered on it, so its credits can't change. */
  creditsLocked?: boolean;
  onDone: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: module?.code ?? "",
      title: module?.title ?? "",
      credits: module?.credits ?? 15,
      semester: module?.semester ?? "FIRST",
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function save({ code, ...details }: z.output<typeof formSchema>) {
    try {
      if (module) {
        await apiRequest("PATCH", `/api/modules/${module.code}`, details);
        toast.success("Changes saved.");
      } else {
        await apiRequest("POST", "/api/modules", { code, ...details });
        toast.success(
          `Set up ${code.toUpperCase()}. Add it to programmes from their pages.`,
        );
      }
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
        {!module && (
          <FormField
            id="code"
            label="Code"
            description="E.g. CS4002. It can't change later."
            error={errors.code?.message}
          >
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                className="w-40 uppercase"
                {...form.register("code")}
              />
            )}
          </FormField>
        )}
        <FormField id="title" label="Title" error={errors.title?.message}>
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              {...form.register("title")}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="credits"
            label="Credits"
            description={
              creditsLocked
                ? "Students are registered on it, so its credits can't change."
                : "In multiples of 5."
            }
            error={errors.credits?.message}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min={5}
                step={5}
                readOnly={creditsLocked}
                className="w-28"
                {...form.register("credits")}
              />
            )}
          </FormField>
          <FormField
            id="semester"
            label="Taught in"
            error={errors.semester?.message}
          >
            {(control) => (
              <NativeSelect {...control} {...form.register("semester")}>
                {SEMESTERS.map((semester) => (
                  <NativeSelectOption key={semester} value={semester}>
                    {SEMESTER_LABELS[semester]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
      </FieldGroup>
      <FormDialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : module ? "Save changes" : "Set up module"}
        </Button>
      </FormDialogFooter>
    </Form>
  );
}
