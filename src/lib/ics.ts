import type { PlannedEvent, PlannedShift } from "./plan";

/**
 * iCalendar (RFC 5545) writer for the shift and travel events. Times are
 * written in UTC (the "Z" form), already converted from the roster's time
 * zone with daylight saving applied, so every calendar app shows the same
 * instants. Lines end in CRLF and are folded at 75 octets.
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

function eventLines(event: PlannedEvent, stamp: string, sequence: number): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `SEQUENCE:${sequence}`,
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
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

/** One calendar holding each shift and its travel event. */
export function buildCalendar(shifts: PlannedShift[], now: number): string {
  const stamp = formatUtc(now);
  const sequence = Math.max(0, Math.floor((now - SEQUENCE_EPOCH) / 60_000));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODID}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const shift of shifts) {
    lines.push(...eventLines(shift.shift, stamp, sequence), ...eventLines(shift.travel, stamp, sequence));
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
