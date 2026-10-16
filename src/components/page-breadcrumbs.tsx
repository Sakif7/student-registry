"use client";

// The pages above the current one, as links, ending with the current page.
import Link from "next/link";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** A page above the current one. */
export interface Crumb {
  label: string;
  href: string;
}

export function PageBreadcrumbs({
  trail,
  current,
}: {
  trail: readonly Crumb[];
  current: string;
}) {
  return (
    <Breadcrumb className="mb-2">
      <BreadcrumbList>
        {trail.map(({ label, href }) => (
          <Fragment key={href}>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={href} />}>
                {label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
