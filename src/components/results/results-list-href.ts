// The Results page's address with its two lists' settings.
import { listHref } from "@/components/lists/list-params";
import type { ResultsListQuery } from "@/domain/results";

/** The Results page with these settings; first pages are left out. */
export function resultsListHref(query: Partial<ResultsListQuery>): string {
  return listHref("/staff/results", {
    aq: query.aq,
    apage: query.apage && query.apage > 1 ? query.apage : undefined,
    q: query.q,
    show: query.show,
    page: query.page && query.page > 1 ? query.page : undefined,
  });
}
