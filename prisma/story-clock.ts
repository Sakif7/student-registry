// When the demo's events happen. Its story is told around the moment it is
// seeded: work due from three weeks ago to three weeks on, submitted, marked,
// published and withheld in the days between. All of it belongs to the
// current academic year, whose students are the ones registered for the
// work. Seeded in a year's first or last three weeks, the story would spill
// into the year before or after, so there it is squeezed toward now to fit,
// in the same order.

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** How far the story reaches either side of now, in days. */
export const STORY_REACH_DAYS = { past: 23, future: 21 } as const;

export interface StoryClock {
  /**
   * The instant a moment of the story happens, given in milliseconds from
   * now (negative for the past): the same instant while the year has room
   * for the story, and one nearer now when it hasn't. Moments beyond the
   * story's reach, such as when students first enrolled, stay where they
   * are.
   */
  at(offset: number): Date;
  /** Whether the story had to be squeezed to fit in the year. */
  squeezed: boolean;
}

/**
 * Places the demo's story in the current academic year.
 *
 * @param now - When the demo is seeded.
 * @param year - When the current academic year starts, and when the next one
 *   does.
 * @throws RangeError in the first or last minute of the year, which has no
 *   room for any of the story.
 */
export function storyClock(
  now: Date,
  year: { start: Date; end: Date },
): StoryClock {
  const past = STORY_REACH_DAYS.past * MS_PER_DAY;
  const future = STORY_REACH_DAYS.future * MS_PER_DAY;
  const pastShare = share(now.getTime() - year.start.getTime(), past);
  const futureShare = share(year.end.getTime() - now.getTime(), future);
  return {
    at(offset) {
      const reach = offset < 0 ? past : future;
      const factor =
        Math.abs(offset) > reach ? 1 : offset < 0 ? pastShare : futureShare;
      return new Date(now.getTime() + offset * factor);
    },
    squeezed: pastShare < 1 || futureShare < 1,
  };
}

/**
 * The share of the story's reach that fits in the room the year has on one
 * side of now: all of it, or what fits an hour clear of the year's edge (or
 * half the room, when there is less than two hours).
 */
function share(room: number, reach: number): number {
  if (room < MS_PER_MINUTE) {
    throw new RangeError(
      "The academic year starts or ends within a minute, leaving no room for the demo's work: seed it again in a minute.",
    );
  }
  return Math.min(1, (room - Math.min(MS_PER_HOUR, room / 2)) / reach);
}
