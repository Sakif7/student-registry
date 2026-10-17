// The page for an address that matches nothing, in the look of the
// signed-out pages. Pages that can't find a record (a student ID that isn't on
// file, say) show the staff or student version instead, inside the app.
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20"
    >
      <p className="mb-8 text-lg font-semibold tracking-tight">
        Student Registry
      </p>
      {/* Spaced as the signed-out pages are. */}
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-1 mb-6 text-muted-foreground">
          There&apos;s no page at this address. The link may be mistyped, or the
          page may have moved.
        </p>
        <Link href="/" className={buttonVariants()}>
          Go to the Student Registry
        </Link>
      </div>
    </main>
  );
}
