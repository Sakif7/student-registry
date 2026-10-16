// A card on the dashboard: a section named by its heading, with an optional
// count beside the heading, a description, and a link to the full list.
import Link from "next/link";
import { type ReactNode, useId } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardCard({
  title,
  level = 2,
  count,
  description,
  link,
  className,
  children,
}: {
  title: string;
  /** 2 for a card of its own, 3 for one in a group under a heading. */
  level?: 2 | 3;
  count?: number;
  description?: ReactNode;
  /** Where to see everything the card sums up. */
  link?: { href: string; label: string };
  className?: string;
  children: ReactNode;
}) {
  // Not a fixed id: a page hidden by client navigation stays in the document.
  const headingId = useId();
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={headingId} className={className}>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heading id={headingId}>{title}</Heading>
            {count !== undefined && (
              <Badge variant="secondary" className="tabular-nums">
                {count}
              </Badge>
            )}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
          {link && (
            <CardAction>
              <Link
                href={link.href}
                className="text-sm font-medium whitespace-nowrap underline-offset-4 hover:underline"
              >
                {link.label}
              </Link>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex-1">{children}</CardContent>
      </Card>
    </section>
  );
}

/** A group of cards under a heading of its own. */
export function DashboardGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid grid-cols-1 gap-3">
      <h2 id={headingId} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** What a card says when it has nothing to show. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
