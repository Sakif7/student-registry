"use client";

// Search and filters for the programmes list and the module catalogue. Like
// the other lists' filters, each is a GET form, so they live in the URL;
// with JavaScript, the search follows typing and the selects apply at once.
import Form from "next/form";
import Link from "next/link";
import { type ChangeEvent, useId } from "react";

import { LiveSearch } from "@/components/lists/live-search";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  type ModuleListQuery,
  NO_PROGRAMME,
  type ProgrammeListQuery,
  SEMESTER_LABELS,
  SEMESTERS,
} from "@/domain/curriculum";

export function ProgrammeFilterBar({ query }: { query: ProgrammeListQuery }) {
  return (
    <Form
      action="/staff/programmes"
      scroll={false}
      role="search"
      aria-label="Find programmes"
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      <LiveSearch placeholder="Code or title" />
      {query.q && <ClearFilters href="/staff/programmes" />}
    </Form>
  );
}

export function ModuleFilterBar({
  query,
  programmes,
}: {
  query: ModuleListQuery;
  /** Every programme, for the programme filter. */
  programmes: { code: string; title: string }[];
}) {
  const applyNow = (event: ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();
  // Unique to this instance, as hidden pages stay in the document.
  const id = useId();

  return (
    <Form
      action="/staff/modules"
      scroll={false}
      role="search"
      aria-label="Find modules"
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      <LiveSearch placeholder="Code or title" />

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}semester`}>Taught in</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}semester`}
          name="semester"
          // Remounts when this filter changes elsewhere (Back, "Clear
          // filters"), to show the one applied; the search box never does.
          key={query.semester ?? ""}
          defaultValue={query.semester ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">Any semester</NativeSelectOption>
          {SEMESTERS.map((semester) => (
            <NativeSelectOption key={semester} value={semester}>
              {SEMESTER_LABELS[semester]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}programme`}>Programme</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}programme`}
          name="programme"
          // Remounts when this filter changes elsewhere (Back, "Clear
          // filters"), to show the one applied; the search box never does.
          key={query.programme ?? ""}
          defaultValue={query.programme ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">All programmes</NativeSelectOption>
          {programmes.map((programme) => (
            <NativeSelectOption key={programme.code} value={programme.code}>
              {programme.title}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={NO_PROGRAMME}>
            In no programme
          </NativeSelectOption>
        </NativeSelect>
      </div>

      {(query.q || query.semester || query.programme) && (
        <ClearFilters href="/staff/modules" />
      )}
    </Form>
  );
}

function ClearFilters({
  href,
}: {
  href: "/staff/modules" | "/staff/programmes";
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={buttonVariants({ variant: "outline" })}
    >
      Clear filters
    </Link>
  );
}
