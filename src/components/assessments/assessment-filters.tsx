"use client";

// Search and filters for the staff list of assessments. Like the student
// list's, it is a GET form, so the filters live in the URL and work without
// JavaScript; with it, the search follows typing and the selects apply as
// soon as they change.
import Form from "next/form";
import Link from "next/link";
import { type ChangeEvent, useId } from "react";

import { HiddenParams } from "@/components/lists/list-params";
import { LiveSearch } from "@/components/lists/live-search";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  ASSESSMENT_STATE_LABELS,
  type AssessmentListQuery,
  type AssessmentState,
} from "@/domain/submissions";

const STATES: readonly AssessmentState[] = ["OPEN", "ACCEPTING_LATE", "CLOSED"];

export function AssessmentFilterBar({
  query,
  academicYears,
}: {
  query: AssessmentListQuery;
  /** The academic years assessments are set for, latest first. */
  academicYears: string[];
}) {
  const applyNow = (event: ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();
  const filtered = Boolean(query.q || query.state || query.year);
  // Unique to this instance, as hidden pages stay in the document.
  const id = useId();

  return (
    <Form
      action="/staff/assessments"
      scroll={false}
      role="search"
      aria-label="Find assessments"
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      {/* Searching and filtering keep the list's order. */}
      <HiddenParams params={{ sort: query.sort, dir: query.dir }} />
      <LiveSearch placeholder="Title, module code or module" />

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}state`}>State</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}state`}
          name="state"
          defaultValue={query.state ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">All states</NativeSelectOption>
          {STATES.map((state) => (
            <NativeSelectOption key={state} value={state}>
              {ASSESSMENT_STATE_LABELS[state]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}year`}>Academic year</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}year`}
          name="year"
          defaultValue={query.year ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">All years</NativeSelectOption>
          {academicYears.map((year) => (
            <NativeSelectOption key={year} value={year}>
              {year}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {filtered && (
        <Link
          href="/staff/assessments"
          scroll={false}
          className={buttonVariants({ variant: "outline" })}
        >
          Clear filters
        </Link>
      )}
    </Form>
  );
}
