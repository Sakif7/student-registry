import { describe, expect, it } from "vitest";

import { addDays, wallTimeToInstant } from "@/domain/college-time";

import { STORY_REACH_DAYS, storyClock } from "./story-clock";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

function london(wallTime: string): number {
  const instant = wallTimeToInstant(wallTime, "Europe/London");
  if (!instant) throw new Error(`No such time: ${wallTime}`);
  return instant.getTime();
}

/** Equal, give or take a millisecond of rounding. */
function expectAbout(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

// 2026/27, from midnight on 1 September 2026 to midnight on 1 September 2027.
const start = london("2026-09-01T00:00");
const end = london("2027-09-01T00:00");
const year = { start: new Date(start), end: new Date(end) };

// Moments across the whole story, oldest first: from its earliest to its
// latest, by the hour.
const story = Array.from(
  { length: (STORY_REACH_DAYS.past + STORY_REACH_DAYS.future) * 24 + 1 },
  (_, hour) => (hour - STORY_REACH_DAYS.past * 24) * HOUR,
);

function clockAt(now: number): (offset: number) => number {
  const clock = storyClock(new Date(now), year);
  return (offset) => clock.at(offset).getTime();
}

describe("storyClock", () => {
  it("leaves the story where it is while the year has room for it", () => {
    const now = london("2026-10-15T10:00");
    expect(storyClock(new Date(now), year).squeezed).toBe(false);
    const at = clockAt(now);
    for (const offset of story) expect(at(offset)).toBe(now + offset);
  });

  it("squeezes the past into a year that began days ago, an hour clear of its start", () => {
    const now = london("2026-09-03T10:00");
    expect(storyClock(new Date(now), year).squeezed).toBe(true);
    const at = clockAt(now);
    expectAbout(at(-STORY_REACH_DAYS.past * DAY), start + HOUR);
    // Halfway back in the story, halfway back in the year.
    expectAbout(
      at((-STORY_REACH_DAYS.past * DAY) / 2),
      (start + HOUR + now) / 2,
    );
    // The future has room, so it stays where it is.
    expect(at(10 * DAY)).toBe(now + 10 * DAY);
  });

  it("squeezes the future into a year about to end", () => {
    const now = london("2027-08-29T10:00");
    expect(storyClock(new Date(now), year).squeezed).toBe(true);
    const at = clockAt(now);
    expectAbout(at(STORY_REACH_DAYS.future * DAY), end - HOUR);
    expect(at(-10 * DAY)).toBe(now - 10 * DAY);
  });

  it("leaves moments beyond the story's reach alone, such as when students enrolled", () => {
    const now = london("2026-09-03T10:00");
    const at = clockAt(now);
    expect(at(-40 * DAY)).toBe(now - 40 * DAY);
    expect(at(-400 * DAY)).toBe(now - 400 * DAY);
  });

  it("keeps half the room clear with less than two hours of the year gone", () => {
    const at = clockAt(start + 30 * MINUTE);
    expectAbout(at(-STORY_REACH_DAYS.past * DAY), start + 15 * MINUTE);
  });

  it("has no room in the first or last minute of the year", () => {
    expect(() => clockAt(start + 59_000)).toThrow(RangeError);
    expect(() => clockAt(end - 59_000)).toThrow(RangeError);
  });

  it("keeps the whole story inside the year, in order, either side of now, on every day of it", () => {
    const problems: string[] = [];
    for (let day = 0; day < 365; day += 1) {
      const date = addDays("2026-09-01", day);
      for (const time of ["00:02", "09:00", "17:00", "23:58"]) {
        const now = london(`${date}T${time}`);
        const at = clockAt(now);
        let previous = -Infinity;
        for (const offset of story) {
          const instant = at(offset);
          const when = `${date}T${time}, ${offset / HOUR} hours`;
          if (instant <= start || instant >= end) {
            problems.push(`${when}: outside the year`);
          }
          if (instant < previous) problems.push(`${when}: out of order`);
          if (Math.sign(instant - now) !== Math.sign(offset)) {
            problems.push(`${when}: on the wrong side of now`);
          }
          previous = instant;
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
