import { describe, expect, it } from "vitest";

import { isSearchShortcut } from "./keyboard";

describe("isSearchShortcut", () => {
  it("is Ctrl+K or ⌘K, in either case", () => {
    expect(isSearchShortcut({ key: "k", ctrlKey: true })).toBe(true);
    expect(isSearchShortcut({ key: "K", metaKey: true })).toBe(true);
  });

  it("isn't K alone, or another key", () => {
    expect(isSearchShortcut({ key: "k" })).toBe(false);
    expect(isSearchShortcut({ key: "j", ctrlKey: true })).toBe(false);
  });

  it("ignores the key-less events a browser's autofill sends", () => {
    expect(isSearchShortcut({})).toBe(false);
    expect(isSearchShortcut({ key: undefined, ctrlKey: true })).toBe(false);
  });
});
