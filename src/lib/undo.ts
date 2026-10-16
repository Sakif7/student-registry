// A confirmation with an Undo button, for an action that can be reversed
// straight away: Undo makes the opposite request, says so and refreshes the
// page. Both changes go into the audit trail, as any others would.
import { toast } from "sonner";

import { refreshAfterWrite } from "@/server/actions";

import { ApiError } from "./api-client";

/** Long enough to read the message and reach the button. */
const UNDO_TOAST_MS = 8000;

/**
 * Says an action succeeded, with an Undo button.
 *
 * @param message - What was done, e.g. "Closed to submissions."
 * @param undo - The request that reverses it, and what to say once it has.
 */
export function toastWithUndo(
  message: string,
  undo: { run: () => Promise<unknown>; done: string },
): void {
  toast.success(message, {
    duration: UNDO_TOAST_MS,
    action: {
      label: "Undo",
      onClick: () => {
        void (async () => {
          try {
            await undo.run();
            toast.success(undo.done);
            await refreshAfterWrite();
          } catch (error) {
            if (!(error instanceof ApiError)) throw error;
            toast.error(error.message);
          }
        })();
      },
    },
  });
}
