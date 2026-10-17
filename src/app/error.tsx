"use client";

// Shown when a page outside the staff and student areas fails unexpectedly,
// such as the sign-in page, or one of those areas' own layouts. It keeps the
// look of the signed-out pages, as not-found.tsx does.
import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20"
    >
      <p className="mb-8 text-lg font-semibold tracking-tight">
        Student Registry
      </p>
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-1 mb-6 text-muted-foreground">
          This page couldn&apos;t be shown just now. Try again in a moment. If
          it keeps happening, report it with the reference below.
        </p>
        {error.digest && (
          <p className="mb-6 text-sm text-muted-foreground">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go to the Student Registry
          </Link>
        </div>
      </div>
    </main>
  );
}
