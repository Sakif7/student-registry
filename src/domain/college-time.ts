// Calendar dates and wall-clock times in the college's time zone, using Intl
// only. Date-only values (birth, due and payment dates) are "YYYY-MM-DD"
// strings; instants (deadlines, timestamps) are Date objects.
import { z } from "zod";

/** A calendar date with no time or time zone, written "YYYY-MM-DD". */
export type CalendarDate = string;

/** A wall-clock date and time with no time zone, written "YYYY-MM-DDTHH:mm". */
export type WallTime = string;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/** True when the value is a real date written "YYYY-MM-DD" (so not 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Validates a calendar date typed or chosen by a person. */
export const calendarDateSchema = z
  .string({ error: "Enter a date" })
  .trim()
  .refine(isCalendarDate, { error: "Enter a real date, e.g. 2026-10-15" });

// A datetime-local field's value; some browsers add seconds.
const WALL_TIME_INPUT =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?$/;

/**
 * Validates a date and time typed or chosen by a person, as a datetime-local
 * field sends it. Outputs "YYYY-MM-DDTHH:mm", dropping any seconds.
 */
export const wallTimeSchema = z
  .string({ error: "Enter a date and time" })
  .trim()
  .min(1, "Enter a date and time")
  .transform((value, ctx): WallTime => {
    const match = WALL_TIME_INPUT.exec(value);
    if (!match || !isCalendarDate(match[1])) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a real date and time, e.g. 2026-11-20T17:00",
      });
      return z.NEVER;
    }
    return `${match[1]}T${match[2]}:${match[3]}`;
  });

/**
 * Today's date in the given time zone.
 *
 * @param timeZone - IANA time zone, e.g. "Europe/London".
 * @param now - The current instant; defaults to the system clock.
 */
export function todayIn(
  timeZone: string,
  now: Date = new Date(),
): CalendarDate {
  return wallTimeOf(now.getTime(), timeZone).slice(0, 10);
}

/** The calendar date `days` days after (or, if negative, before) `date`. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  return new Date(toUtcMidnight(date) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / MS_PER_DAY);
}

/** The Date to store in a `date` column: midnight UTC, so no day shift. */
export function toDbDate(date: CalendarDate): Date {
  return new Date(toUtcMidnight(date));
}

/** The calendar date read back from a `date` column. */
export function fromDbDate(date: Date): CalendarDate {
  return date.toISOString().slice(0, 10);
}

/**
 * Converts a wall-clock time in a time zone to the instant it denotes.
 *
 * Daylight-saving changes make two cases special. A time inside the hour the
 * clocks skip (e.g. 01:30 on the last Sunday of March in London) never
 * happens, so the result is `null`. A time inside the hour that happens twice
 * (e.g. 01:30 on the last Sunday of October) resolves to its first
 * occurrence. Both rules hold whatever the server's own time zone is.
 *
 * @param wallTime - "YYYY-MM-DDTHH:mm", as sent by a datetime-local input.
 * @param timeZone - IANA time zone, e.g. "Europe/London".
 * @returns The instant, or null if that wall-clock time does not exist.
 * @throws RangeError if `wallTime` is not in the expected format.
 */
export function wallTimeToInstant(
  wallTime: WallTime,
  timeZone: string,
): Date | null {
  const match = WALL_TIME.exec(wallTime);
  if (!match) throw new RangeError(`Not a wall-clock time: "${wallTime}"`);
  const [, year, month, day, hour, minute] = match.map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);

  // Offsets can only change at a transition, and transitions are months
  // apart, so the offsets 12 hours either side are the only candidates.
  const candidates = [
    asIfUtc - offsetAt(asIfUtc - 12 * MS_PER_HOUR, timeZone),
    asIfUtc - offsetAt(asIfUtc + 12 * MS_PER_HOUR, timeZone),
  ].sort((a, b) => a - b);

  // The earliest candidate that really shows this wall-clock time wins.
  const instant = candidates.find(
    (candidate) => wallTimeOf(candidate, timeZone) === wallTime,
  );
  return instant === undefined ? null : new Date(instant);
}

/** The wall-clock time an instant shows in a time zone, "YYYY-MM-DDTHH:mm". */
export function instantToWallTime(instant: Date, timeZone: string): WallTime {
  return wallTimeOf(instant.getTime(), timeZone);
}

function toUtcMidnight(date: CalendarDate): number {
  if (!isCalendarDate(date)) {
    throw new RangeError(`Not a calendar date: "${date}"`);
  }
  return Date.parse(`${date}T00:00:00.000Z`);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsAt(time: number, timeZone: string): Record<string, string> {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return Object.fromEntries(
    formatter.formatToParts(time).map((part) => [part.type, part.value]),
  );
}

function wallTimeOf(time: number, timeZone: string): WallTime {
  const p = partsAt(time, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** How far the time zone's clocks are ahead of UTC at `time`, in ms. */
function offsetAt(time: number, timeZone: string): number {
  const p = partsAt(time, timeZone);
  const wall = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return wall - (time - (time % 1000));
}
