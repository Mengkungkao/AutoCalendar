import { MINUTE_MS, instantToWall, offsetMinutes, wallTimeToInstant } from "./time";

/**
 * Time-zone support for the calendar files: event times are written as local
 * Melbourne times (TZID=Australia/Melbourne) so Calendar shows them as AEDT or
 * AEST rather than GMT, and each file carries a VTIMEZONE block describing the
 * zone's daylight-saving changes for the years its events fall in. The
 * changes are found with Intl, so any IANA zone in Settings works.
 */

const HOUR_MS = 60 * MINUTE_MS;
const SAMPLE_MS = 6 * HOUR_MS;

type Transition = { at: number; from: number; to: number };

const pad2 = (value: number) => String(value).padStart(2, "0");

/** "+1100", "-0330" */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${pad2(Math.floor(absolute / 60))}${pad2(absolute % 60)}`;
}

/** "AEDT"/"AEST" for Melbourne; falls back to "GMT+11"-style names where no abbreviation exists. */
export function zoneAbbreviation(instant: number, timeZone: string): string {
  let fallback = "";
  for (const locale of ["en-AU", "en-US", "en-GB"]) {
    const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
      .formatToParts(new Date(instant))
      .find((part) => part.type === "timeZoneName")?.value;
    if (!name) continue;
    if (!/^(GMT|UTC)[+-]/.test(name)) return name;
    fallback ||= name;
  }
  return fallback || "UTC";
}

/** The instants in [from, to) at which the zone's UTC offset changes, to the minute. */
export function offsetTransitions(timeZone: string, from: number, to: number): Transition[] {
  const transitions: Transition[] = [];
  let previous = from;
  let previousOffset = offsetMinutes(previous, timeZone);
  for (let sample = from + SAMPLE_MS; sample <= to; sample += SAMPLE_MS) {
    const offset = offsetMinutes(sample, timeZone);
    if (offset !== previousOffset) {
      let low = previous; // still the old offset
      let high = sample; // already the new offset
      while (high - low > MINUTE_MS) {
        const middle = low + Math.floor((high - low) / 2 / MINUTE_MS) * MINUTE_MS;
        if (offsetMinutes(middle, timeZone) === previousOffset) low = middle;
        else high = middle;
      }
      transitions.push({ at: high, from: previousOffset, to: offset });
    }
    previous = sample;
    previousOffset = offset;
  }
  return transitions;
}

/** Local wall time as iCalendar text, e.g. "20261019T073000". */
export function formatLocalDateTime(instant: number, timeZone: string): string {
  const { dateISO, minutes } = instantToWall(instant, timeZone);
  return `${dateISO.replace(/-/g, "")}T${pad2(Math.floor(minutes / 60))}${pad2(minutes % 60)}00`;
}

/**
 * True when the local time names this instant unambiguously. During the
 * autumn change a wall time like 2:30 AM happens twice; calendars read
 * TZID times as the first one, so a time in the second must be written in UTC.
 */
export function localTimeIsExact(instant: number, timeZone: string): boolean {
  const { dateISO, minutes } = instantToWall(instant, timeZone);
  return wallTimeToInstant(dateISO, minutes, timeZone) === instant;
}

/** A VTIMEZONE covering the given instants (and a year either side), as unfolded lines. */
export function vtimezoneLines(timeZone: string, instants: number[]): string[] {
  const earliest = Math.min(...instants);
  const latest = Math.max(...instants);
  const firstYear = new Date(earliest).getUTCFullYear() - 1;
  const lastYear = new Date(latest).getUTCFullYear() + 1;
  const transitions = offsetTransitions(timeZone, Date.UTC(firstYear, 0, 1), Date.UTC(lastYear + 1, 0, 1));

  const lines = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`];
  if (transitions.length === 0) {
    const offset = formatOffset(offsetMinutes(earliest, timeZone));
    lines.push(
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      `TZNAME:${zoneAbbreviation(earliest, timeZone)}`,
      "END:STANDARD",
    );
  }
  for (const { at, from, to } of transitions) {
    // An observance starts at the local time just before the change, read with the old offset.
    const local = new Date(at + from * MINUTE_MS).toISOString().replace(/[-:]/g, "").slice(0, 15);
    const kind = to > from ? "DAYLIGHT" : "STANDARD";
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${local}`,
      `TZOFFSETFROM:${formatOffset(from)}`,
      `TZOFFSETTO:${formatOffset(to)}`,
      `TZNAME:${zoneAbbreviation(at, timeZone)}`,
      `END:${kind}`,
    );
  }
  lines.push("END:VTIMEZONE");
  return lines;
}
