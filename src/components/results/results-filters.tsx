"use client";

// Search and filters for results: the staff Results page's two lists (the
// assessments with marks to publish, and the students with marks), and a
// student's own results. Each is a GET form that
// carries the other list's settings through, so narrowing one list leaves
// the other as it was.
import Form from "next/form";
import Link from "next/link";
import { type ChangeEvent, useId } from "react";

import { HiddenParams, listHref } from "@/components/lists/list-params";
import { LiveSearch } from "@/components/lists/live-search";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  CLASSIFICATION_LABELS,
  CLASSIFICATIONS,
  RESULTS_LIST_SHOW_LABELS,
  RESULTS_LIST_SHOWS,
  type ResultsListQuery,
  type StudentResultsListQuery,
} from "@/domain/results";

export function AssessmentsToPublishSearch({
  query,
}: {
  query: ResultsListQuery;
}) {
  return (
    <Form
      action="/staff/results"
      scroll={false}
      role="search"
      aria-label="Find assessments with marks to publish"
      className="mb-4 flex flex-wrap items-end gap-3"
    >
      <HiddenParams
        params={{ q: query.q, show: query.show, page: query.page }}
      />
      <LiveSearch
        label="Search assessments"
        placeholder="Title, module code or module"
        param="aq"
        pageParam="apage"
      />
    </Form>
  );
}

export function ResultsStudentFilters({ query }: { query: ResultsListQuery }) {
  const applyNow = (event: ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();
  // Unique to this instance, as hidden pages stay in the document.
  const id = useId();

  return (
    <Form
      action="/staff/results"
      scroll={false}
      role="search"
      aria-label="Find students with marks"
      className="mb-4 flex flex-wrap items-end gap-3"
    >
      <HiddenParams params={{ aq: query.aq, apage: query.apage }} />
      <LiveSearch label="Search students" placeholder="Name or student ID" />

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}show`}>Show</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}show`}
          name="show"
          defaultValue={query.show ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">
            Every student with marks
          </NativeSelectOption>
          {RESULTS_LIST_SHOWS.map((show) => (
            <NativeSelectOption key={show} value={show}>
              {RESULTS_LIST_SHOW_LABELS[show]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {(query.q || query.show) && (
        <Link
          href={listHref("/staff/results", {
            aq: query.aq,
            apage: query.apage,
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

/** Search and a classification for a student's own results. */
export function StudentResultsFilterBar({
  query,
}: {
  query: StudentResultsListQuery;
}) {
  const applyNow = (event: ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();
  // Unique to this instance, as hidden pages stay in the document.
  const id = useId();

  return (
    <Form
      action="/student/results"
      scroll={false}
      role="search"
      aria-label="Find results"
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      <LiveSearch placeholder="Assessment or module" />

      <div className="grid w-full gap-1.5 sm:w-auto">
        <Label htmlFor={`${id}result`}>Result</Label>
        <NativeSelect
          className="w-full sm:w-fit"
          id={`${id}result`}
          name="result"
          defaultValue={query.result ?? ""}
          onChange={applyNow}
        >
          <NativeSelectOption value="">Every result</NativeSelectOption>
          {[...CLASSIFICATIONS].reverse().map((classification) => (
            <NativeSelectOption key={classification} value={classification}>
              {CLASSIFICATION_LABELS[classification]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {(query.q || query.result) && (
        <Link
          href="/student/results"
          scroll={false}
          className={buttonVariants({ variant: "outline" })}
        >
          Clear filters
        </Link>
      )}
    </Form>
  );
}
