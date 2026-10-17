"use client";

// Sets up a programme, or changes one: its title, annual fee, length and the
// credits a year carries. Its code is set once, like a student ID.
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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
  createProgrammeSchema,
  MAX_PROGRAMME_YEARS,
} from "@/domain/curriculum";
import {
  chargeAmountSchema,
  penceToPoundsInput,
  poundsField,
} from "@/domain/money";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";

// The API's rules, with the fee in pounds and the numbers as typed.
const formSchema = createProgrammeSchema.extend({
  annualFeePence: poundsField(chargeAmountSchema),
  years: z.coerce.number().pipe(createProgrammeSchema.shape.years),
  creditsPerYear: z.coerce
    .number()
    .pipe(createProgrammeSchema.shape.creditsPerYear),
});

type Values = z.output<typeof formSchema>;

export interface ProgrammeDetails {
  code: string;
  title: string;
  annualFeePence: number;
  years: number;
  creditsPerYear: number;
}

export function ProgrammeForm({
  programme,
  onDone,
}: {
  /** The programme to change; a new one is set up without it. */
  programme?: ProgrammeDetails;
  /** Called once saved, e.g. to close a dialog. */
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: programme?.code ?? "",
      title: programme?.title ?? "",
      annualFeePence: programme
        ? penceToPoundsInput(programme.annualFeePence)
        : "",
      years: programme?.years ?? 3,
      creditsPerYear: programme?.creditsPerYear ?? 120,
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function save({ code, ...details }: Values) {
    try {
      if (programme) {
        await apiRequest("PATCH", `/api/programmes/${programme.code}`, details);
        toast.success("Changes saved.");
        await refreshAfterWrite();
        onDone();
      } else {
        await apiRequest("POST", "/api/programmes", { code, ...details });
        toast.success(`Set up ${code.toUpperCase()}. Now add its modules.`);
        await refreshAfterWrite();
        onDone();
        router.push(`/staff/programmes/${code.toUpperCase()}`);
      }
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
        {!programme && (
          <FormField
            id="code"
            label="Code"
            description="Used in filters and addresses, e.g. BSC-CS. It can't change later."
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
        <FormField
          id="annualFeePence"
          label="Annual fee (£)"
          description="Charged to each student for each academic year. A new fee applies to charges from now on."
          error={errors.annualFeePence?.message}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              autoComplete="off"
              className="w-40"
              {...form.register("annualFeePence")}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="years"
            label="Years of study"
            error={errors.years?.message}
          >
            {(control) => (
              <NativeSelect {...control} {...form.register("years")}>
                {Array.from({ length: MAX_PROGRAMME_YEARS }, (_, index) => (
                  <NativeSelectOption key={index} value={index + 1}>
                    {index + 1} {index === 0 ? "year" : "years"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id="creditsPerYear"
            label="Credits a year"
            description="120 for most undergraduate years, 180 for a one-year MSc."
            error={errors.creditsPerYear?.message}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min={10}
                step={5}
                className="w-28"
                {...form.register("creditsPerYear")}
              />
            )}
          </FormField>
        </div>
      </FieldGroup>
      <FormDialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving…"
            : programme
              ? "Save changes"
              : "Set up programme"}
        </Button>
      </FormDialogFooter>
    </Form>
  );
}
