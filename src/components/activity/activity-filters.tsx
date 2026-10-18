"use client";

// Search and a kind of change for the activity log. Like the other lists'
// filters, it is a GET form, so they live in the URL; with JavaScript, the
// search follows typing and the select applies at once.
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
  ACTIVITY_AREA_LABELS,
  ACTIVITY_AREAS,
  type ActivityQuery,
} from "@/domain/audit";

export function ActivityFilterBar({ query }: { query: ActivityQuery }) {
  const applyNow = (event: ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();
  // Unique to this instance, as hidden pages stay in the document.
  const id = useId();

  return (
    <Form
      action="/staff/activity"
      scroll={false}
      role="search"
      aria-label="Find changes"
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      <LiveSearch placeholder="Student, student ID or staff member" />

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}area`}>Kind of change</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}area`}
          name="area"
          defaultValue={query.area ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">Every kind</NativeSelectOption>
          {ACTIVITY_AREAS.map((area) => (
            <NativeSelectOption key={area} value={area}>
              {ACTIVITY_AREA_LABELS[area]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {(query.q || query.area) && (
        <Link
          href="/staff/activity"
          scroll={false}
          className={buttonVariants({ variant: "outline" })}
        >
          Clear filters
        </Link>
      )}
    </Form>
  );
}
