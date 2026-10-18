"use client";

// Search and filters for the student list. It is a GET form, so the filters
// live in the URL: a filtered view can be bookmarked or shared, Back undoes a
// change, and the form still works without JavaScript. With JavaScript, the
// search follows typing (see LiveSearch), and the selects apply as soon as
// they change.
import Form from "next/form";
import { type ChangeEvent, useId } from "react";
import Link from "next/link";

import { LiveSearch } from "@/components/lists/live-search";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  ENROLMENT_STATUS_LABELS,
  ENROLMENT_STATUSES,
} from "@/domain/enrolment";
import type { StudentFilters } from "@/domain/students";
import type { ProgrammeOption } from "@/server/services/students";

export function StudentFilterBar({
  filters,
  programmes,
  academicYears,
}: {
  filters: StudentFilters;
  programmes: ProgrammeOption[];
  academicYears: string[];
}) {
  const applyNow = (event: ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();
  const filtered = Boolean(
    filters.q || filters.programme || filters.status || filters.year,
  );
  // Unique to this instance, as hidden pages stay in the document.
  const id = useId();

  return (
    <Form
      action="/staff/students"
      scroll={false}
      role="search"
      aria-label="Find students"
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      {/* Searching and filtering keep the list's order. */}
      {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}
      {filters.dir && <input type="hidden" name="dir" value={filters.dir} />}
      <LiveSearch placeholder="Name, student ID or email" />

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}programme`}>Programme</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}programme`}
          name="programme"
          // Remounts when this filter changes elsewhere (Back, "Clear
          // filters"), to show the one applied; the search box never does.
          key={filters.programme ?? ""}
          defaultValue={filters.programme ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">All programmes</NativeSelectOption>
          {programmes.map((programme) => (
            <NativeSelectOption key={programme.code} value={programme.code}>
              {programme.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}status`}>Status</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}status`}
          name="status"
          // Remounts when this filter changes elsewhere (Back, "Clear
          // filters"), to show the one applied; the search box never does.
          key={filters.status ?? ""}
          defaultValue={filters.status ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          {ENROLMENT_STATUSES.map((status) => (
            <NativeSelectOption key={status} value={status}>
              {ENROLMENT_STATUS_LABELS[status]}
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
          // Remounts when this filter changes elsewhere (Back, "Clear
          // filters"), to show the one applied; the search box never does.
          key={filters.year ?? ""}
          defaultValue={filters.year ?? ""}
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
          href="/staff/students"
          scroll={false}
          className={buttonVariants({ variant: "outline" })}
        >
          Clear filters
        </Link>
      )}
    </Form>
  );
}
