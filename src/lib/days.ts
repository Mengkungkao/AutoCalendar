import type { ShiftDraft } from "./plan";
import type { DayCode, DayResult, RosterResult } from "./roster";
import { formatDayLabel, formatRosterTime } from "./time";

/** The preview's editable state: one entry per roster day. */

export type EditableShift = ShiftDraft & {
  id: string;
  /** The range as the roster had it ("0730 - 1700"), or null for a shift the user added. */
  rosterText: string | null;
  edited: boolean;
};

export type DayEntry = {
  day: DayCode;
  dateISO: string;
  label: string;
  cellText: string | null;
  /** Why the roster gave no shift, shown when `shifts` is empty. */
  noShift: string;
  functions: string | null;
  checks: string[];
  shifts: EditableShift[];
};

function noShiftLabel(day: DayResult): string {
  switch (day.reading.kind) {
    case "off":
      return day.reading.reason === "off" ? "OFF" : day.reading.reason === "red" ? "Red cell (day off)" : "Blank (day off)";
    case "unclear":
      return `No times found${day.cellText ? `: “${day.cellText.trim()}”` : ""}`;
    case "missing":
      return "Not in the image";
    case "shift":
      return "Removed";
  }
}

export function dayEntries(result: Extract<RosterResult, { ok: true }>): DayEntry[] {
  return result.days.map((day) => ({
    day: day.day,
    dateISO: day.dateISO,
    label: formatDayLabel(day.dateISO),
    cellText: day.cellText,
    noShift: noShiftLabel(day),
    functions: day.functions,
    checks: day.checks,
    shifts:
      day.reading.kind === "shift"
        ? day.reading.ranges.map((range, slot) => ({
            id: `${day.dateISO}-${slot}`,
            dateISO: day.dateISO,
            slot,
            start: range.start,
            end: range.end,
            note: day.reading.kind === "shift" ? day.reading.note : null,
            functions: day.functions,
            rosterText: range.text,
            edited: false,
          }))
        : [],
  }));
}

export function newShift(day: DayEntry): EditableShift {
  const slot = day.shifts.length === 0 ? 0 : Math.max(...day.shifts.map((shift) => shift.slot)) + 1;
  return {
    id: `${day.dateISO}-${slot}-added`,
    dateISO: day.dateISO,
    slot,
    start: 9 * 60,
    end: 17 * 60,
    note: null,
    functions: day.functions,
    rosterText: null,
    edited: true,
  };
}

/** "0730–1700" for showing an edited shift next to what the roster said. */
export function rosterStyle(shift: Pick<ShiftDraft, "start" | "end">): string {
  return `${formatRosterTime(shift.start)}–${formatRosterTime(shift.end)}`;
}

export function toDraft(shift: EditableShift): ShiftDraft {
  return {
    dateISO: shift.dateISO,
    slot: shift.slot,
    start: shift.start,
    end: shift.end,
    note: shift.note?.trim() ? shift.note.trim() : null,
    functions: shift.functions,
  };
}
