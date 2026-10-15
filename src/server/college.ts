// The college's clock: today's date and the time zone everything is shown in.
import "server-only";

import { type CalendarDate, todayIn } from "@/domain/college-time";

import { env } from "./env";

/** The college's time zone, e.g. "Europe/London". */
export function collegeTimeZone(): string {
  return env().APP_TIME_ZONE;
}

/** Today's date in the college's time zone. */
export function collegeToday(): CalendarDate {
  return todayIn(collegeTimeZone());
}
