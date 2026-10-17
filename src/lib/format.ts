// Display formatting in UK English, shared by server and client components.
// Dates are assembled from fixed month and weekday names rather than Intl's
// date styles, whose punctuation and abbreviations vary between ICU versions
// (e.g. "Sep" or "Sept"); Node and each browser ship their own, and text that
// differed between server and browser would break hydration.
import {
  type CalendarDate,
  daysBetween,
  instantToWallTime,
} from "@/domain/college-time";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/** Pence as pounds, e.g. 125050 → "£1,250.50" and -1000 → "-£10.00". */
export function formatMoney(pence: number): string {
  return money.format(pence / 100);
}

/** A calendar date, e.g. "2026-10-15" → "15 Oct 2026". */
export function formatDate(date: CalendarDate): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The date an instant falls on in a time zone, e.g. "1 Oct 2026". */
export function formatDateOf(instant: Date, timeZone: string): string {
  return formatDate(instantToWallTime(instant, timeZone).slice(0, 10));
}

/**
 * An instant shown in a time zone, with the zone's abbreviation, e.g.
 * "Fri 20 Nov 2026, 17:00 GMT", or with seconds, "17:00:03 GMT". Seconds
 * suit a submission time: work at 17:00:03 is late for a 17:00 deadline.
 */
export function formatDateTime(
  instant: Date,
  timeZone: string,
  { seconds = false }: { seconds?: boolean } = {},
): string {
  const wallTime = instantToWallTime(instant, timeZone);
  const [year, month, day] = wallTime.slice(0, 10).split("-").map(Number);
  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  // Zone offsets are whole minutes, so the seconds are the same in UTC.
  const time = seconds
    ? `${wallTime.slice(11)}:${String(instant.getUTCSeconds()).padStart(2, "0")}`
    : wallTime.slice(11);
  return `${weekday} ${day} ${MONTHS[month - 1]} ${year}, ${time} ${zoneAbbreviation(instant, timeZone)}`;
}

/** A file size in bytes, e.g. 2048 → "2 KB" and 1572864 → "1.5 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "1 day", "2 days". */
export function formatDays(days: number): string {
  return formatCount(days, "day");
}

/**
 * How far away a day is, counted in days from today: "today", "tomorrow",
 * "in 3 days", "yesterday" or "3 days ago".
 */
export function formatDaysAway(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${formatDays(days)}` : `${formatDays(-days)} ago`;
}

/**
 * How far away a deadline is. Less than a day ahead, in hours or minutes: a
 * deadline at midnight is "tomorrow" by the calendar, but only hours away.
 * Otherwise in days by the college's calendar, as formatDaysAway.
 */
export function formatDeadlineAway(
  deadline: Date,
  now: Date,
  timeZone: string,
): string {
  const left = deadline.getTime() - now.getTime();
  if (left > 0 && left < 24 * 60 * 60 * 1000) {
    // Rounded down, so a student is never told they have longer than they do.
    const minutes = Math.floor(left / 60_000);
    if (minutes < 1) return "in less than a minute";
    return minutes < 60
      ? `in ${formatCount(minutes, "minute")}`
      : `in ${formatCount(Math.floor(minutes / 60), "hour")}`;
  }
  const dateOf = (instant: Date) =>
    instantToWallTime(instant, timeZone).slice(0, 10);
  return formatDaysAway(daysBetween(dateOf(now), dateOf(deadline)));
}

/** A count and its noun, e.g. "1 student", "3 students", "2 people". */
export function formatCount(
  count: number,
  noun: string,
  plural = `${noun}s`,
): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** The zone's short name at that instant, e.g. "GMT" or "BST" for London. */
function zoneAbbreviation(instant: Date, timeZone: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}
