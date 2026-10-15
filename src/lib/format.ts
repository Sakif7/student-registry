// Display formatting in UK English, shared by server and client components.
// Dates are assembled from fixed month and weekday names rather than Intl's
// date styles, whose punctuation and abbreviations vary between ICU versions
// (e.g. "Sep" or "Sept"); Node and each browser ship their own, and text that
// differed between server and browser would break hydration.
import { type CalendarDate, instantToWallTime } from "@/domain/college-time";

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

/**
 * An instant shown in a time zone, with the zone's abbreviation, e.g.
 * "Fri 20 Nov 2026, 17:00 GMT".
 */
export function formatDateTime(instant: Date, timeZone: string): string {
  const wallTime = instantToWallTime(instant, timeZone);
  const [year, month, day] = wallTime.slice(0, 10).split("-").map(Number);
  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1]} ${year}, ${wallTime.slice(11)} ${zoneAbbreviation(instant, timeZone)}`;
}

/** "1 day", "2 days". */
export function formatDays(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** The zone's short name at that instant, e.g. "GMT" or "BST" for London. */
function zoneAbbreviation(instant: Date, timeZone: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}
