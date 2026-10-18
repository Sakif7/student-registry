"use client";

// Chooses the academic year a page's figures are for, kept in the address
// as `year`, as the lists keep their filters: last year's fees and marks
// stay in reach after 1 September starts this year's afresh. A GET form, so
// it works without JavaScript; with it, a choice applies at once.
import Form from "next/form";
import { useId } from "react";

import { HiddenParams } from "@/components/lists/list-params";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

export function YearSelect({
  action,
  label,
  year,
  years,
  params = {},
}: {
  /** The page the figures are on. */
  action: "/staff" | "/staff/modules";
  label: string;
  /** The year shown now. */
  year: string;
  /** The years to choose from, oldest first. */
  years: readonly string[];
  /** The page's other settings, carried through. */
  params?: Record<string, string | number | undefined>;
}) {
  // Unique to this instance, as hidden pages stay in the document.
  const id = useId();
  return (
    <Form
      action={action}
      scroll={false}
      className="flex items-center gap-2"
      aria-label={label}
    >
      <HiddenParams params={params} />
      <Label htmlFor={`${id}year`} className="whitespace-nowrap">
        {label}
      </Label>
      <NativeSelect
        id={`${id}year`}
        name="year"
        // Remounts when the year changes elsewhere (Back), to show it.
        key={year}
        defaultValue={year}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {years.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Form>
  );
}
