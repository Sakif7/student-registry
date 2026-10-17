"use client";

// Enrol a student, or edit a student's details. Fields are checked with the
// same rules the API uses before anything is sent, and anything the server
// still rejects (such as an email already in use) appears beside the field.
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Form } from "@/components/forms/form";
import { FormDialogFooter } from "@/components/forms/form-dialog";
import { applyServerErrors } from "@/components/forms/server-errors";
import { FormField } from "@/components/forms/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { passwordSchema } from "@/domain/accounts";
import type { CalendarDate } from "@/domain/college-time";
import { ENROLMENT_STATUS_LABELS, INITIAL_STATUSES } from "@/domain/enrolment";
import { studentDetailsSchema } from "@/domain/students";
import { formatMoney } from "@/lib/format";
import { ApiError, apiRequest } from "@/lib/api-client";
import { refreshAfterWrite } from "@/server/actions";
import type { ProgrammeOption } from "@/server/services/students";

import { type DemoSignIn, FirstSignInFields } from "./first-sign-in-fields";

type InitialStatus = (typeof INITIAL_STATUSES)[number];

export interface StudentDetailsValues {
  fullName: string;
  email: string;
  dateOfBirth: string;
  programmeCode: string;
  academicYear: string;
  yearOfStudy: number;
}

type StudentFormProps = {
  programmes: ProgrammeOption[];
  academicYears: string[];
  /** The college's date, for validating the date of birth. */
  today: CalendarDate;
} & (
  | {
      mode: "create";
      defaultAcademicYear: string;
      /** In the demo: a new student starts with the demo password. */
      demo?: DemoSignIn;
    }
  | {
      mode: "edit";
      studentNumber: string;
      defaultValues: StudentDetailsValues;
      /** Called once the changes are saved; the form sits in a FormDialog. */
      onDone: () => void;
    }
);

export function StudentForm(props: StudentFormProps) {
  const { programmes, academicYears, today } = props;
  const router = useRouter();
  const [status, setStatus] = useState<InitialStatus>("ENROLLED");
  // How the new student first signs in. In the demo, with a password set
  // now, so that they can be tried straight away.
  const demo = props.mode === "create" ? props.demo : undefined;
  const [sendLink, setSendLink] = useState(!demo);
  const [password, setPassword] = useState(demo?.password ?? "");
  const [passwordError, setPasswordError] = useState<string>();
  const passwordRef = useRef<HTMLInputElement>(null);
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
            yearOfStudy: 1,
          },
  });
  const { errors, isSubmitting } = form.formState;
  // The chosen programme's years; before one is chosen, the longest.
  const programmeCode = useWatch({
    control: form.control,
    name: "programmeCode",
  });
  const years =
    programmes.find((programme) => programme.code === programmeCode)?.years ??
    Math.max(1, ...programmes.map((programme) => programme.years));

  /** What is wrong with the password typed, if one is being set now. */
  function passwordProblem(): string | undefined {
    if (props.mode !== "create" || sendLink) return undefined;
    return passwordSchema.safeParse(password).error?.issues[0]?.message;
  }

  async function save(details: StudentDetailsValues) {
    if (passwordProblem()) {
      passwordRef.current?.focus();
      return;
    }
    try {
      let student: SavedStudent;
      if (props.mode === "create") {
        const enrolled = await apiRequest<{
          student: SavedStudent;
          activationEmail: { to: string; sent: boolean } | null;
        }>("POST", "/api/students", {
          ...details,
          status,
          ...(sendLink ? {} : { password }),
        });
        student = enrolled.student;
        const enrolledAs = `Enrolled ${student.fullName} as ${student.studentNumber}.`;
        if (!enrolled.activationEmail) {
          toast.success(enrolledAs, {
            description: "They can sign in now, with the password you set.",
          });
        } else if (enrolled.activationEmail.sent) {
          toast.success(enrolledAs, {
            description: `An activation email went to ${enrolled.activationEmail.to}.`,
            action: demo && {
              label: "Open the inbox",
              onClick: () => window.open(demo.inboxUrl, "_blank", "noopener"),
            },
          });
        } else {
          // The student can't sign in until it goes, so say so plainly.
          toast.warning(enrolledAs, {
            description:
              "The activation email couldn't be sent. Send it again from the record, under Sign-in.",
            duration: Infinity,
          });
        }
      } else {
        ({ student } = await apiRequest<{ student: SavedStudent }>(
          "PATCH",
          `/api/students/${props.studentNumber}`,
          details,
        ));
        toast.success("Changes saved.");
      }
      await refreshAfterWrite();
      if (props.mode === "edit") props.onDone();
      else router.push(`/staff/students/${student.studentNumber}`);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      applyServerErrors(form.setError, error);
      setPasswordError(error.fieldErrors.password?.[0]);
      toast.error(error.message);
    }
  }

  return (
    <Form
      noValidate
      className={props.mode === "create" ? "max-w-xl" : "grid gap-4"}
      onSubmit={(event) => {
        // The password isn't one of the form's own fields, so it is checked
        // here, alongside them.
        setPasswordError(passwordProblem());
        void form.handleSubmit(save)(event);
      }}
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

        <FormField
          id="yearOfStudy"
          label="Year of study"
          description="Which year of the programme the student is in. The year's core modules are registered for them."
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

        {props.mode === "create" && (
          <FirstSignInFields
            sendLink={sendLink}
            onSendLinkChange={(value) => {
              setSendLink(value);
              setPasswordError(undefined);
            }}
            password={password}
            onPasswordChange={(value) => {
              setPassword(value);
              if (passwordError) setPasswordError(undefined);
            }}
            error={passwordError}
            passwordRef={passwordRef}
            demo={demo}
          />
        )}

        {props.mode === "create" && (
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Enrol student"}
            </Button>
            <Link
              href="/staff/students"
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
          </div>
        )}
      </FieldGroup>
      {props.mode === "edit" && (
        <FormDialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </FormDialogFooter>
      )}
    </Form>
  );
}

interface SavedStudent {
  studentNumber: string;
  fullName: string;
}
