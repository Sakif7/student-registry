// Keyboard shortcuts, as pure checks of a key press.

/**
 * Whether a key press is Ctrl+K (⌘K on a Mac), which opens search.
 * Browsers' autofill fires "keydown" events that carry no key at all when a
 * saved value is chosen from their dropdown, so the key is checked to be
 * text before it is read.
 */
export function isSearchShortcut(event: {
  key?: unknown;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): boolean {
  return (
    typeof event.key === "string" &&
    event.key.toLowerCase() === "k" &&
    Boolean(event.metaKey || event.ctrlKey)
  );
}
