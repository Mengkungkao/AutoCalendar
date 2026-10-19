/**
 * Wall-clock ↔ instant conversion for an IANA time zone using only Intl, so
 * no time-zone database ships in the bundle. Daylight saving follows
 * Temporal's "compatible" rule: a wall time inside a spring-forward gap moves
 * forward by the gap, and a wall time that happens twice (autumn fall-back)
 * resolves to the earlier instant.
 *
 * Dates are ISO strings ("2026-10-19"); times are minutes after that date's
 * midnight and may exceed 1440 for shifts that end the next day.
 */

export const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
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
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The zone's UTC offset at an instant, in minutes (+660 for AEDT). */
export function offsetMinutes(instant: number, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const wallAsUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour") % 24,
    field("minute"),
    field("second"),
  );
  const wholeSeconds = instant - (((instant % 1000) + 1000) % 1000);
  return Math.round((wallAsUtc - wholeSeconds) / MINUTE_MS);
}

export function parseISODate(dateISO: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!match) throw new Error(`Not an ISO date: ${dateISO}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function dateToUtcMidnight(dateISO: string): number {
  const { year, month, day } = parseISODate(dateISO);
  return Date.UTC(year, month - 1, day);
}

function utcMidnightToISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return utcMidnightToISO(dateToUtcMidnight(value)) === value;
}

export function addDays(dateISO: string, days: number): string {
  return utcMidnightToISO(dateToUtcMidnight(dateISO) + days * DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(dateISO: string): number {
  return (new Date(dateToUtcMidnight(dateISO)).getUTCDay() + 6) % 7;
}

/** The instant at which a wall-clock time happens in the zone. */
export function wallTimeToInstant(dateISO: string, minutes: number, timeZone: string): number {
  const wall = dateToUtcMidnight(dateISO) + minutes * MINUTE_MS;
  const offsetBefore = offsetMinutes(wall - DAY_MS, timeZone);
  const offsetAfter = offsetMinutes(wall + DAY_MS, timeZone);
  const valid = [offsetBefore, offsetAfter]
    .map((offset) => ({ offset, instant: wall - offset * MINUTE_MS }))
    .filter(({ offset, instant }) => offsetMinutes(instant, timeZone) === offset)
    .map(({ instant }) => instant);
  if (valid.length > 0) return Math.min(...valid);
  // In a spring-forward gap: read the time with the offset from before the jump.
  return wall - offsetBefore * MINUTE_MS;
}

/** The wall-clock date and time of an instant in the zone. */
export function instantToWall(instant: number, timeZone: string): { dateISO: string; minutes: number } {
  const local = instant + offsetMinutes(instant, timeZone) * MINUTE_MS;
  const midnight = Math.floor(local / DAY_MS) * DAY_MS;
  return { dateISO: utcMidnightToISO(midnight), minutes: Math.round((local - midnight) / MINUTE_MS) };
}

const pad2 = (value: number) => String(value).padStart(2, "0");

function clockParts(minutes: number): { text: string; meridiem: "AM" | "PM" } {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return { text: `${hour % 12 || 12}:${pad2(minute)}`, meridiem: hour < 12 ? "AM" : "PM" };
}

/** "7:30 AM" */
export function formatClock(instant: number, timeZone: string): string {
  const { text, meridiem } = clockParts(instantToWall(instant, timeZone).minutes);
  return `${text} ${meridiem}`;
}

/** "7:00 – 7:30 AM", or "11:45 PM – 12:15 AM" when the halves differ. */
export function formatClockRange(start: number, end: number, timeZone: string): string {
  const from = instantToWall(start, timeZone);
  const to = instantToWall(end, timeZone);
  const a = clockParts(from.minutes);
  const b = clockParts(to.minutes);
  if (a.meridiem === b.meridiem && from.dateISO === to.dateISO) return `${a.text} – ${b.text} ${b.meridiem}`;
  return `${a.text} ${a.meridiem} – ${b.text} ${b.meridiem}`;
}

/** "Mon 19 Oct" */
export function formatDayLabel(dateISO: string): string {
  const { month, day } = parseISODate(dateISO);
  return `${WEEKDAYS_SHORT[weekdayIndex(dateISO)]} ${day} ${MONTHS_SHORT[month - 1]}`;
}

/** Minutes → "0730", "2700" (roster style, hours may pass 24). */
export function formatRosterTime(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}${pad2(minutes % 60)}`;
}

/** Minutes → "07:30" for <input type="time"> (wraps past midnight). */
export function minutesToInputValue(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

export function inputValueToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Today's date in the zone. */
export function todayInZone(now: number, timeZone: string): string {
  return instantToWall(now, timeZone).dateISO;
}
