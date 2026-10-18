import { describe, expect, it } from "vitest";

import {
  academicYearSettingsSchema,
  coreCredits,
  createModuleSchema,
  createProgrammeSchema,
  filterModules,
  filterProgrammes,
  moduleListSchema,
  NO_PROGRAMME,
  optionsCanMakeUp,
  programmeChangeProblem,
  programmeListSchema,
  semesterDateChanges,
  semesterDateProblems,
  semesterOn,
  type StructureEntry,
  structureEntryProblem,
  updateProgrammeSchema,
} from "./curriculum";

const programme = { years: 3, creditsPerYear: 120 };
const structure: StructureEntry[] = [
  { yearOfStudy: 1, kind: "CORE", credits: 30 },
  { yearOfStudy: 1, kind: "CORE", credits: 60 },
  { yearOfStudy: 1, kind: "OPTIONAL", credits: 30 },
  { yearOfStudy: 1, kind: "OPTIONAL", credits: 30 },
  { yearOfStudy: 2, kind: "CORE", credits: 120 },
];

describe("createProgrammeSchema", () => {
  it("accepts a programme and upper-cases its code", () => {
    expect(
      createProgrammeSchema.parse({
        code: " bsc-cs ",
        title: "BSc (Hons) Computer Science",
        annualFeePence: 953_500,
        years: 3,
        creditsPerYear: 120,
      }),
    ).toMatchObject({ code: "BSC-CS", years: 3, creditsPerYear: 120 });
  });

  it.each([
    [{ code: "1CS" }, "code"],
    [{ years: 0 }, "years"],
    [{ years: 8 }, "years"],
    [{ creditsPerYear: 121 }, "creditsPerYear"],
  ])("refuses %j", (change, field) => {
    const result = createProgrammeSchema.safeParse({
      code: "BSC-CS",
      title: "BSc (Hons) Computer Science",
      annualFeePence: 953_500,
      years: 3,
      creditsPerYear: 120,
      ...change,
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([field]);
  });

  it("needs something to change", () => {
    expect(updateProgrammeSchema.safeParse({}).success).toBe(false);
  });
});

describe("createModuleSchema", () => {
  it("accepts a module, with credits in multiples of 5", () => {
    expect(
      createModuleSchema.parse({
        code: "cs4002",
        title: "Databases",
        credits: 15,
        semester: "SECOND",
      }),
    ).toEqual({
      code: "CS4002",
      title: "Databases",
      credits: 15,
      semester: "SECOND",
    });
    expect(
      createModuleSchema.safeParse({
        code: "CS4002",
        title: "Databases",
        credits: 12,
        semester: "SECOND",
      }).error?.issues[0]?.message,
    ).toBe("Credits come in multiples of 5");
  });
});

describe("coreCredits", () => {
  it("adds up the core modules in a year of study", () => {
    expect(coreCredits(structure, 1)).toBe(90);
    expect(coreCredits(structure, 2)).toBe(120);
    expect(coreCredits(structure, 3)).toBe(0);
  });
});

describe("structureEntryProblem", () => {
  it("allows a core module that fits, and optional modules beyond the year's credits", () => {
    expect(
      structureEntryProblem(programme, structure, {
        yearOfStudy: 1,
        kind: "CORE",
        credits: 30,
      }),
    ).toBeNull();
    // Year 1's options already offer 60 credits for the 30 left: a third
    // is still welcome, as students take only some of them.
    expect(
      structureEntryProblem(programme, structure, {
        yearOfStudy: 1,
        kind: "OPTIONAL",
        credits: 30,
      }),
    ).toBeNull();
  });

  it("refuses an option worth more than the credits core modules leave", () => {
    expect(
      structureEntryProblem(programme, structure, {
        yearOfStudy: 1,
        kind: "OPTIONAL",
        credits: 45,
      }),
    ).toBe(
      "An option in year 1 can be worth at most 30 credits: core modules take 90 of the 120 a year carries",
    );
    expect(
      structureEntryProblem(programme, structure, {
        yearOfStudy: 2,
        kind: "OPTIONAL",
        credits: 30,
      }),
    ).toBe(
      "Core modules take all 120 credits of year 2, which leaves no room for options",
    );
  });

  it("refuses core modules worth more than a year carries", () => {
    expect(
      structureEntryProblem(programme, structure, {
        yearOfStudy: 1,
        kind: "CORE",
        credits: 60,
      }),
    ).toBe(
      "Core modules in year 1 would come to 150 credits, more than the 120 a year carries",
    );
  });

  it("refuses a year the programme doesn't have", () => {
    expect(
      structureEntryProblem(programme, structure, {
        yearOfStudy: 4,
        kind: "OPTIONAL",
        credits: 15,
      }),
    ).toBe("This programme has 3 years of study");
  });
});

describe("optionsCanMakeUp", () => {
  it("finds options that add up to exactly the credits left", () => {
    expect(optionsCanMakeUp(30, [15, 30])).toBe(true);
    expect(optionsCanMakeUp(45, [15, 15, 30])).toBe(true);
    expect(optionsCanMakeUp(0, [])).toBe(true);
  });

  it("knows when no combination does, too few or the wrong sizes", () => {
    expect(optionsCanMakeUp(30, [15])).toBe(false);
    expect(optionsCanMakeUp(30, [20, 20])).toBe(false);
    expect(optionsCanMakeUp(30, [45])).toBe(false);
  });
});

describe("programmeChangeProblem", () => {
  it("allows a change its structure and students fit", () => {
    expect(
      programmeChangeProblem({ years: 2, creditsPerYear: 120 }, structure, 2),
    ).toBeNull();
  });

  it("refuses to cut off a year with modules, or a student's year", () => {
    expect(
      programmeChangeProblem({ years: 1, creditsPerYear: 120 }, structure, 1),
    ).toBe("Year 2 still has modules. Remove them from the structure first.");
    expect(
      programmeChangeProblem({ years: 2, creditsPerYear: 120 }, structure, 3),
    ).toBe("A student on this programme is in year 3.");
  });

  it("refuses fewer credits than the core modules take", () => {
    expect(
      programmeChangeProblem({ years: 3, creditsPerYear: 100 }, structure, 1),
    ).toBe("Core modules in year 2 come to 120 credits, more than 100.");
  });
});

describe("academicYearSettingsSchema", () => {
  const schema = academicYearSettingsSchema("2026/27");
  const dates = {
    semester1Start: "2026-09-21",
    semester1End: "2027-01-22",
    semester2Start: "2027-02-01",
    semester2End: "2027-06-11",
  };

  it("accepts two semesters in order, with students not choosing by default", () => {
    expect(schema.parse(dates)).toEqual({
      ...dates,
      studentsChooseModules: false,
    });
  });

  it("refuses semesters out of order or outside the academic year", () => {
    const problems = (change: Partial<typeof dates>) =>
      schema
        .safeParse({ ...dates, ...change })
        .error?.issues.map((issue) => issue.message);

    expect(problems({ semester1Start: "2026-08-31" })).toEqual([
      "Start on or after 1 September 2026, when 2026/27 begins",
    ]);
    expect(problems({ semester2Start: "2027-01-22" })).toEqual([
      "Start semester 2 after semester 1 ends",
    ]);
    expect(problems({ semester2End: "2027-09-01" })).toEqual([
      "End on or before 31 August 2027, when 2026/27 ends",
    ]);
    expect(problems({ semester1End: "2026-09-21" })).toEqual([
      "End semester 1 after it starts",
    ]);
  });
});

describe("changing a calendar", () => {
  const saved = {
    semester1Start: "2026-09-21",
    semester1End: "2027-01-22",
    semester2Start: "2027-02-01",
    semester2End: "2027-06-11",
  };
  // Semester 1 has started; the rest is still to come.
  const today = "2026-10-15";

  it("keeps a date that has passed as it was", () => {
    expect(
      semesterDateProblems(
        saved,
        { ...saved, semester1Start: "2026-09-28" },
        today,
      ),
    ).toEqual({ semester1Start: "This date has passed, so it can't change" });
  });

  it("moves a date still to come, but not into the past", () => {
    expect(
      semesterDateProblems(
        saved,
        { ...saved, semester2End: "2027-06-18" },
        today,
      ),
    ).toEqual({});
    expect(
      semesterDateProblems(
        saved,
        { ...saved, semester1End: "2026-10-14" },
        today,
      ),
    ).toEqual({
      semester1End: "Choose today or later: a date can't move into the past",
    });
    // Today itself is still to come.
    expect(
      semesterDateProblems(saved, { ...saved, semester1End: today }, today),
    ).toEqual({});
  });

  it("lets a year set up late start in the past", () => {
    expect(semesterDateProblems(null, saved, today)).toEqual({});
  });

  it("names the dates a change moved, before and after", () => {
    expect(
      semesterDateChanges(saved, { ...saved, semester2End: "2027-06-18" }),
    ).toEqual({ semester2End: { from: "2027-06-11", to: "2027-06-18" } });
    expect(semesterDateChanges(saved, saved)).toBeUndefined();
  });
});

describe("semesterOn", () => {
  const calendar = {
    semester1Start: "2026-09-21",
    semester1End: "2027-01-22",
    semester2Start: "2027-02-01",
    semester2End: "2027-06-11",
  };

  it("finds the semester a date falls in, its first and last days included", () => {
    expect(semesterOn("2026-09-21", calendar)).toBe("FIRST");
    expect(semesterOn("2027-01-22", calendar)).toBe("FIRST");
    expect(semesterOn("2027-02-01", calendar)).toBe("SECOND");
    expect(semesterOn("2027-06-11", calendar)).toBe("SECOND");
  });

  it("is null between semesters and in the summer", () => {
    expect(semesterOn("2027-01-25", calendar)).toBeNull();
    expect(semesterOn("2027-07-01", calendar)).toBeNull();
    expect(semesterOn("2026-09-01", calendar)).toBeNull();
  });
});

describe("the programme and module lists", () => {
  const modules = [
    {
      code: "CS4001",
      title: "Programming Fundamentals",
      semester: "FIRST" as const,
      programmes: [{ code: "BSC-CS" }],
    },
    {
      code: "CS4002",
      title: "Databases",
      semester: "SECOND" as const,
      programmes: [{ code: "BSC-CS" }, { code: "MSC-DS" }],
    },
    {
      code: "BM4009",
      title: "Business Ethics",
      semester: "SECOND" as const,
      programmes: [],
    },
  ];
  const codes = (list: readonly { code: string }[]) =>
    list.map(({ code }) => code);

  it("search modules' codes and titles, and narrow to a semester", () => {
    expect(codes(filterModules(modules, { q: "data" }))).toEqual(["CS4002"]);
    expect(codes(filterModules(modules, { q: "cs40" }))).toEqual([
      "CS4001",
      "CS4002",
    ]);
    expect(codes(filterModules(modules, { semester: "SECOND" }))).toEqual([
      "CS4002",
      "BM4009",
    ]);
  });

  it("narrow modules to a programme they're part of, or to none", () => {
    expect(codes(filterModules(modules, { programme: "MSC-DS" }))).toEqual([
      "CS4002",
    ]);
    expect(codes(filterModules(modules, { programme: NO_PROGRAMME }))).toEqual([
      "BM4009",
    ]);
  });

  it("search programmes' codes and titles", () => {
    const programmes = [
      { code: "BSC-CS", title: "BSc (Hons) Computer Science" },
      { code: "MSC-DS", title: "MSc Data Science" },
    ];
    expect(codes(filterProgrammes(programmes, "science"))).toEqual([
      "BSC-CS",
      "MSC-DS",
    ]);
    expect(codes(filterProgrammes(programmes, "msc"))).toEqual(["MSC-DS"]);
  });

  it("read their settings from the URL, ignoring what they can't use", () => {
    expect(
      moduleListSchema.parse({
        q: " data ",
        semester: "SECOND",
        programme: "MSC-DS",
        page: "2",
      }),
    ).toEqual({ q: "data", semester: "SECOND", programme: "MSC-DS", page: 2 });
    expect(
      moduleListSchema.parse({ semester: "SUMMER", programme: "" }),
    ).toMatchObject({ semester: undefined, programme: undefined });
    expect(programmeListSchema.parse({ q: "", page: "x" })).toEqual({
      q: undefined,
      page: undefined,
    });
  });
});
