/**
 * Turns the text of one roster cell into shifts. The model transcribes the
 * cell; this code decides what it means, so the rules are deterministic and
 * tested: "0730 - 1700" is a shift, an end past 2400 finishes the next day,
 * extra words become a note, and OFF, blank or solid-red cells are days off.
 */

export type CellFill = "none" | "red" | "other";

export type TimeRange = {
  /** Minutes after the shift date's midnight. */
  start: number;
  /** Minutes after the shift date's midnight; above 1440 means the next day. */
  end: number;
  /** The range as written, e.g. "0730 - 1700". */
  text: string;
};

export type CellReading =
  | { kind: "off"; reason: "off" | "blank" | "red" }
  | { kind: "shift"; ranges: TimeRange[]; note: string | null; problems: string[] }
  | { kind: "unclear"; problem: string };

// 0730 - 1700, 730-1700, 07:30 – 17:00, 1600 to 2700
const RANGE_PATTERN = /(?<!\d)(\d{1,2})[:.]?(\d{2})\s*(?:-|–|—|~|to)\s*(\d{1,2})[:.]?(\d{2})(?!\d)/gi;

const LONGEST_SHIFT_MINUTES = 16 * 60;
const SHORTEST_SHIFT_MINUTES = 60;

function isOffText(text: string): boolean {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, "");
  return letters === "OFF" || letters === "DAYOFF" || letters === "OFFDAY";
}

function cleanNote(text: string): string | null {
  const note = text
    .replace(/[|,;/()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:.]+|[\s\-–—:.]+$/g, "")
    .trim();
  return note.length > 0 ? note : null;
}

export function readCell(rawText: string, fill: CellFill): CellReading {
  const text = rawText.replace(/\s+/g, " ").trim();

  if (fill === "red") {
    return { kind: "off", reason: "red" };
  }
  if (text === "") return { kind: "off", reason: "blank" };
  if (isOffText(text)) return { kind: "off", reason: "off" };

  const ranges: TimeRange[] = [];
  const problems: string[] = [];
  for (const match of text.matchAll(RANGE_PATTERN)) {
    const [whole, sh, sm, eh, em] = match;
    const startHour = Number(sh);
    const startMinute = Number(sm);
    const endHour = Number(eh);
    const endMinute = Number(em);
    if (startHour > 23 || startMinute > 59 || endHour > 36 || endMinute > 59) {
      return { kind: "unclear", problem: `"${whole}" is not a valid time range.` };
    }
    const start = startHour * 60 + startMinute;
    let end = endHour * 60 + endMinute;
    if (end <= start) {
      end += 1440;
      problems.push(`${whole} ends earlier than it starts, so it was read as finishing the next day.`);
    }
    const length = end - start;
    if (length > LONGEST_SHIFT_MINUTES) problems.push(`${whole} is longer than 16 hours.`);
    if (length < SHORTEST_SHIFT_MINUTES) problems.push(`${whole} is shorter than an hour.`);
    ranges.push({ start, end, text: whole });
  }

  if (ranges.length === 0) {
    return { kind: "unclear", problem: `No shift times found in "${text}".` };
  }
  if (ranges.length > 1) problems.push(`This cell has ${ranges.length} time ranges; each became its own shift.`);

  return { kind: "shift", ranges, note: cleanNote(text.replace(RANGE_PATTERN, " ")), problems };
}

/** Why a cell gives no shift, for the preview. */
export function offLabel(reason: "off" | "blank" | "red"): string {
  return reason === "off" ? "OFF" : reason === "red" ? "Red cell" : "Blank";
}
