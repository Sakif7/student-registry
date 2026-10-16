// Whether React has hydrated the component yet: false while the server's
// HTML is all there is, then true from the first render in the browser.
import { useSyncExternalStore } from "react";

// Nothing to subscribe to: the value only ever changes once, at hydration.
function subscribe(): () => void {
  return () => {};
}

/** False during the server render and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
