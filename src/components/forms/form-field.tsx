"use client";

// A labelled form control with its hint and error message. The control gets
// aria-invalid and aria-describedby, so screen readers announce the hint and
// the error together with the field.
//
// Element ids are unique to each form instance. Next.js keeps visited pages
// mounted while they are hidden, so two forms with an "email" field can be in
// the document at once, and a label must still point at its own control.
import { type ReactNode, useId } from "react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

/** Props to spread onto the control inside a FormField. */
export interface ControlProps {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
}

export function FormField({
  id: name,
  label,
  description,
  error,
  children,
}: {
  /** The field's name, unique within its form. */
  id: string;
  label: string;
  description?: ReactNode;
  error?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const id = `${useId()}${name}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {description && (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
