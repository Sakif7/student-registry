"use client";

// The last resort, when the root layout itself fails: it replaces the whole
// document, so it brings its own <html>, <body> and styles.
import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Something went wrong · Student Registry</title>
        <main className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20">
          <p className="mb-8 text-lg font-semibold tracking-tight">
            Student Registry
          </p>
          <div className="w-full max-w-md">
            <h1 className="text-2xl font-semibold tracking-tight">
              Something went wrong
            </h1>
            <p className="mt-1 mb-6 text-muted-foreground">
              The Student Registry couldn&apos;t be shown just now. Try again in
              a moment. If it keeps happening, report it with the reference
              below.
            </p>
            {error.digest && (
              <p className="mb-6 text-sm text-muted-foreground">
                Reference: <span className="font-mono">{error.digest}</span>
              </p>
            )}
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
