"use server";

// The app's one Server Action. All writes go through the API; after a
// successful write the UI calls this so that Next.js drops its client-side
// copies of pages. `router.refresh()` only refreshes the current page, and the
// browser's Back button reuses cached pages, so a dashboard visited before
// recording a payment would otherwise still show the old balance.
import { refresh } from "next/cache";

/** Clears the client's cached pages and re-renders the current one. */
// eslint-disable-next-line @typescript-eslint/require-await -- Server Actions must be async functions.
export async function refreshAfterWrite(): Promise<void> {
  refresh();
}
