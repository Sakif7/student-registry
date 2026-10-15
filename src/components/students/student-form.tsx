"use client";

// Enrol a student, or edit a student's details. Fields are checked with the
// same rules the API uses before anything is sent, and anything the server
// still rejects (such as an email already in use) appears beside the field.
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors } from "@/components/forms/server-errors";
import { FormField } from "@/components/forms/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { CalendarDate } from "@/domain/college-time";
import { ENROLMENT_STATUS_LABELS, INITIAL_STATUSES } from "@/domain/enrolment";
import { studentDetailsSchema } from "@/domain/students";
import { formatMoney } from "@/lib/format";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";
import type { ProgrammeOption } from "@/server/services/students";

type InitialStatus = (typeof INITIAL_STATUSES)[number];

interface StudentDetailsValues {
  fullName: string;
  email: string;
  dateOfBirth: string;
  programmeCode: string;
  academicYear: string;
}

type StudentFormProps = {
  programmes: ProgrammeOption[];
  academicYears: string[];
  /** The college's date, for validating the date of birth. */
  today: CalendarDate;
} & (
  | { mode: "create"; defaultAcademicYear: string }
  | { mode: "edit"; studentNumber: string; defaultValues: StudentDetailsValues }
);

export function StudentForm(props: StudentFormProps) {
  const { programmes, academicYears, today } = props;
  const router = useRouter();
  const [status, setStatus] = useState<InitialStatus>("ENROLLED");
  const form = useForm({
    resolver: zodResolver(studentDetailsSchema(today)),
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : {
            fullName: "",
            email: "",
            dateOfBirth: "",
            programmeCode: "",
            academicYear: props.defaultAcademicYear,
          },
  });
  const { errors, isSubmitting } = form.formState;

  async function save(details: StudentDetailsValues) {
    try {
      const { student } =
        props.mode === "create"
          ? await apiRequest<{ student: SavedStudent }>(
              "POST",
              "/api/students",
              {
                ...details,
                status,
              },
            )
          : await apiRequest<{ student: SavedStudent }>(
              "PATCH",
              `/api/students/${props.studentNumber}`,
              details,
            );
      toast.success(
        props.mode === "create"
          ? `Enrolled ${student.fullName} as ${student.studentNumber}.`
          : "Changes saved.",
      );
      await refreshAfterWrite();
      router.push(`/staff/students/${student.studentNumber}`);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      toast.error(error.message);
    }
  }

  const cancelHref =
    props.mode === "edit"
      ? `/staff/students/${props.studentNumber}`
      : "/staff/students";

  return (
    <form
      noValidate
      className="max-w-xl"
      onSubmit={(event) => void form.handleSubmit(save)(event)}
    >
      <FieldGroup>
        <FormField
          id="fullName"
          label="Full name"
          error={errors.fullName?.message}
        >
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              {...form.register("fullName")}
            />
          )}
        </FormField>

        <FormField id="email" label="Email" error={errors.email?.message}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="off"
              {...form.register("email")}
            />
          )}
        </FormField>

        <FormField
          id="dateOfBirth"
          label="Date of birth"
          error={errors.dateOfBirth?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              max={today}
              className="w-fit"
              {...form.register("dateOfBirth")}
            />
          )}
        </FormField>

        <FormField
          id="programmeCode"
          label="Programme"
          error={errors.programmeCode?.message}
        >
          {(control) => (
            <NativeSelect
              {...control}
              className="w-full"
              {...form.register("programmeCode")}
            >
              <NativeSelectOption value="" disabled>
                Choose a programme
              </NativeSelectOption>
              {programmes.map((programme) => (
                <NativeSelectOption key={programme.code} value={programme.code}>
                  {programme.title} ({formatMoney(programme.annualFeePence)} a
                  year)
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField
          id="academicYear"
          label="Academic year"
          description={
            props.mode === "create"
              ? "The year the student starts. It also sets the year in their student ID."
              : "The student's current academic session."
          }
          error={errors.academicYear?.message}
        >
          {(control) => (
            <NativeSelect {...control} {...form.register("academicYear")}>
              {academicYears.map((year) => (
                <NativeSelectOption key={year} value={year}>
                  {year}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>

        {props.mode === "create" && (
          <FormField
            id="status"
            label="Enrolment status"
            description="Choose Deferred for a deferred entry: the student joins in a later year."
          >
            {(control) => (
              <NativeSelect
                {...control}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as InitialStatus)
                }
              >
                {INITIAL_STATUSES.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {ENROLMENT_STATUS_LABELS[option]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving…"
              : props.mode === "create"
                ? "Enrol student"
                : "Save changes"}
          </Button>
          <Link
            href={cancelHref}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
        </div>
      </FieldGroup>
    </form>
  );
}

interface SavedStudent {
  studentNumber: string;
  fullName: string;
}
