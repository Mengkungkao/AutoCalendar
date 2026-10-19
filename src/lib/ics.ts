import type { PlannedEvent, PlannedShift } from "./plan";
import { formatLocalDateTime, localTimeIsExact, vtimezoneLines } from "./vtimezone";

/**
 * iCalendar (RFC 5545) writer for the shift events. Times are
 * written as local times in the roster's zone (DTSTART;TZID=Australia/
 * Melbourne:20261019T073000) with a VTIMEZONE block, so Calendar shows them
 * as AEDT/AEST rather than GMT. Lines end in CRLF and are folded at 75 octets.
 */

const PRODID = "-//AutoCalendar//Roster to Calendar//EN";
// SEQUENCE grows with every export, so a re-imported (updated) roster is newer than the copy in the calendar.
const SEQUENCE_EPOCH = Date.UTC(2026, 0, 1);

export function formatUtc(instant: number): string {
  return new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

/** Splits a content line into 75-octet pieces without breaking a UTF-8 character. */
export function foldLine(line: string): string {
  if (utf8Length(line) <= 75) return line;
  const pieces: string[] = [];
  let piece = "";
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const charSize = utf8Length(char);
    if (size + charSize > limit) {
      pieces.push(piece);
      piece = "";
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    piece += char;
    size += charSize;
  }
  pieces.push(piece);
  return pieces.join("\r\n ");
}

export function alarmTrigger(minutesBefore: number): string {
  return minutesBefore === 0 ? "PT0M" : `-PT${minutesBefore}M`;
}

/** `DTSTART;TZID=Australia/Melbourne:20261019T073000`, or UTC for a time in the repeated autumn hour. */
function dateTimeLine(name: "DTSTART" | "DTEND", instant: number, timeZone: string): string {
  return localTimeIsExact(instant, timeZone)
    ? `${name};TZID=${timeZone}:${formatLocalDateTime(instant, timeZone)}`
    : `${name}:${formatUtc(instant)}`;
}

function eventLines(event: PlannedEvent, timeZone: string, stamp: string, sequence: number): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `SEQUENCE:${sequence}`,
    dateTimeLine("DTSTART", event.start, timeZone),
    dateTimeLine("DTEND", event.end, timeZone),
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.travelMinutes) lines.push(`X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT${event.travelMinutes}M`);
  lines.push("TRANSP:OPAQUE", "STATUS:CONFIRMED");
  for (const alarm of event.alarms) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(alarm.message)}`,
      `TRIGGER;RELATED=START:${alarmTrigger(alarm.minutes)}`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

/** One calendar holding each shift's events (see PlannedShift.events). */
export function buildCalendar(shifts: PlannedShift[], now: number): string {
  const stamp = formatUtc(now);
  const sequence = Math.max(0, Math.floor((now - SEQUENCE_EPOCH) / 60_000));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODID}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const timeZone of new Set(shifts.map((shift) => shift.timeZone))) {
    const instants = shifts
      .filter((shift) => shift.timeZone === timeZone)
      .flatMap((shift) => [shift.times.travelStart, shift.times.end]);
    lines.push(...vtimezoneLines(timeZone, instants));
  }
  for (const shift of shifts) {
    for (const event of shift.events) lines.push(...eventLines(event, shift.timeZone, stamp, sequence));
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
