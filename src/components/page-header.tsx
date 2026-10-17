// The heading row of a page: where it sits (breadcrumbs), its title, optional
// context above and below the title, and actions on the right.
import type { ReactNode } from "react";

import { type Crumb, PageBreadcrumbs } from "./page-breadcrumbs";

export function PageHeader({
  title,
  breadcrumbs,
  eyebrow,
  description,
  actions,
}: {
  title: ReactNode;
  /** The pages above this one, outermost first; the title ends the trail. */
  breadcrumbs?: readonly Crumb[];
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && typeof title === "string" && (
        <PageBreadcrumbs trail={breadcrumbs} current={title} />
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-sm text-muted-foreground">{eyebrow}</p>
          )}
          {/* A long name with no spaces breaks rather than widen a phone. */}
          <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-prose text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
