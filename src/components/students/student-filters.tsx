"use client";

// Search and filters for the student list. It is a GET form, so the filters
// live in the URL: a filtered view can be bookmarked or shared, Back undoes a
// change, and the form still works without JavaScript. With JavaScript,
// <Form> navigates client-side and the selects apply as soon as they change.
import Form from "next/form";
import type { ChangeEvent } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  return (
    <Form
      action="/staff/students"
      scroll={false}
      role="search"
      aria-label="Find students"
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="q">Search</Label>
        <div className="flex gap-2">
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Name, student ID or email"
            className="w-64"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="programme">Programme</Label>
        <NativeSelect
          id="programme"
          name="programme"
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

      <div className="grid gap-1.5">
        <Label htmlFor="status">Status</Label>
        <NativeSelect
          id="status"
          name="status"
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

      <div className="grid gap-1.5">
        <Label htmlFor="year">Academic year</Label>
        <NativeSelect
          id="year"
          name="year"
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
          className={buttonVariants({ variant: "ghost" })}
        >
          Clear filters
        </Link>
      )}
    </Form>
  );
}
