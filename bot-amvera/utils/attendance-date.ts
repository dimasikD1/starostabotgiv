import { formatDateInTimeZone } from './time-zone.js';

/** Resolve today's calendar date using the configured institutional time zone. */
export function getAttendanceDate(now: Date, timeZone: string): string {
  return formatDateInTimeZone(now, timeZone);
}
