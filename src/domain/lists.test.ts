import { describe, expect, it } from "vitest";

import {
  listPageSchema,
  listSearchSchema,
  matchesSearch,
  paginate,
} from "./lists";

describe("paginate", () => {
  const rows = Array.from({ length: 45 }, (_, index) => index + 1);

  it("cuts a list into pages of 20", () => {
    expect(paginate(rows, 1)).toMatchObject({
      total: 45,
      page: 1,
      pageCount: 3,
      pageSize: 20,
    });
    expect(paginate(rows, 3).items).toEqual([41, 42, 43, 44, 45]);
  });

  it("gives the last page for a page past the end, and the first for less than 1", () => {
    expect(paginate(rows, 99)).toMatchObject({ page: 3 });
    expect(paginate(rows, 0)).toMatchObject({ page: 1 });
  });

  it("has one, empty, page for an empty list", () => {
    expect(paginate([], 4)).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageCount: 1,
      pageSize: 20,
    });
  });
});

describe("matchesSearch", () => {
  it("matches part of any text, ignoring case", () => {
    expect(matchesSearch("lab", ["SQL Lab test", "CS4002"])).toBe(true);
    expect(matchesSearch("cs40", ["SQL lab test", "CS4002"])).toBe(true);
    expect(matchesSearch("essay", ["SQL lab test", null])).toBe(false);
  });

  it("matches everything without a search", () => {
    expect(matchesSearch(undefined, ["anything"])).toBe(true);
  });

  it("ignores how an accent was typed, and which apostrophe a name holds", () => {
    expect(matchesSearch("Chloé", ["Chloé Dubois"])).toBe(true);
    expect(matchesSearch("O’Connor", ["Liam O'Connor"])).toBe(true);
    expect(matchesSearch("O'Neill", ["Siobhán O’Neill"])).toBe(true);
  });
});

describe("the address's search and page", () => {
  it("trims a search, cuts it to 100 characters, and drops an empty one", () => {
    expect(listSearchSchema.parse("  lab  ")).toBe("lab");
    expect(listSearchSchema.parse("x".repeat(150))).toHaveLength(100);
    expect(listSearchSchema.parse("   ")).toBeUndefined();
  });

  it("ignores a page number that isn't one", () => {
    expect(listPageSchema.parse("2")).toBe(2);
    expect(listPageSchema.parse("0")).toBeUndefined();
    expect(listPageSchema.parse("two")).toBeUndefined();
  });
});
