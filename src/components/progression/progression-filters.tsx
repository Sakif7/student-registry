"use client";

// Search and filters for the students to move on. Like the other lists'
// filters, a GET form, so they live in the URL; with JavaScript, the search
// follows typing and the selects apply at once. In August, when students can
// be moved on to next year too, it says which year they move on to.
import Form from "next/form";
import Link from "next/link";
import { type ChangeEvent, useId } from "react";

import { listHref } from "@/components/lists/list-params";
import { LiveSearch } from "@/components/lists/live-search";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { academicYearSlug } from "@/domain/academic-year";
import type { ProgressionQuery } from "@/domain/progression";

export function ProgressionFilterBar({
  query,
  targets,
  programmes,
  maxYears,
}: {
  query: ProgressionQuery & { to: string };
  /** The years students can be moved on to now. */
  targets: string[];
  programmes: { code: string; title: string }[];
  /** The longest programme's years of study. */
  maxYears: number;
}) {
  const applyNow = (event: ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();
  // Unique to this instance, as hidden pages stay in the document.
  const id = useId();
  const to = academicYearSlug(query.to);
  const filtered = Boolean(query.q || query.programme || query.year);

  return (
    <Form
      action="/staff/progression"
      scroll={false}
      role="search"
      aria-label="Find students to move on"
      className="flex flex-wrap items-end gap-3"
    >
      {targets.length > 1 && (
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor={`${id}to`}>Moving on to</Label>
          <NativeSelect
            className="w-full sm:w-fit"
            id={`${id}to`}
            name="to"
            // Remounts when this changes elsewhere (Back), to show the year
            // applied; the search box never does.
            key={to}
            defaultValue={to}
            onChange={applyNow}
          >
            {targets.map((year) => (
              <NativeSelectOption key={year} value={academicYearSlug(year)}>
                {year}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      <LiveSearch placeholder="Name or student ID" />
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
        </NativeSelect>
      </div>
      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}year`}>Year of study</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}year`}
          name="year"
          // Remounts when this filter changes elsewhere, as above.
          key={query.year ?? ""}
          defaultValue={query.year ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">All years</NativeSelectOption>
          {Array.from({ length: maxYears }, (_, index) => (
            <NativeSelectOption key={index} value={index + 1}>
              Year {index + 1}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {filtered && (
        <Link
          href={listHref("/staff/progression", {
            to: targets.length > 1 ? to : undefined,
          })}
          scroll={false}
          className={buttonVariants({ variant: "outline" })}
        >
          Clear filters
        </Link>
      )}
    </Form>
  );
}
