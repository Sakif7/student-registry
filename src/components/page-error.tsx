"use client";

// What a page inside the app shows when it fails unexpectedly, say with the
// database out of reach: the sidebar and the rest of the app keep working,
// and the page can be tried again. The error itself is logged on the server;
// its reference lets a report be matched to the log.
import Link from "next/link";
import { useEffect } from "react";

import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";

export function PageError({
  error,
  retry,
  home,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  home: { href: "/staff" | "/student"; label: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader
        title="Something went wrong"
        description="This page couldn't be shown just now. Try again in a moment. If it keeps happening, report it with the reference below."
      />
      {error.digest && (
        <p className="mb-6 text-sm text-muted-foreground">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Link
          href={home.href}
          className={buttonVariants({ variant: "outline" })}
        >
          {home.label}
        </Link>
      </div>
    </>
  );
}
