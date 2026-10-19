import { z } from "zod";
import { readCell, type CellFill, type CellReading } from "./cells";
import { nameMatches, similarNames } from "./names";
import { addDays, isISODate, parseISODate, weekdayIndex, formatDayLabel } from "./time";

/**
 * What the vision model returns (a transcription, not an interpretation) and
 * how it becomes a week of days. The model copies text and colours; this
 * module finds the user's row, works out the dates and reads the shifts, so
 * the decisions that matter are made by tested code rather than by the model.
 */

export const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type DayCode = (typeof DAY_CODES)[number];

const dayCode = z.enum(DAY_CODES);

export const modelRosterSchema = z.object({
  is_roster: z.boolean().describe("False if the image is not a weekly work roster table."),
  roster_title: z.string().nullable().describe('The title exactly as printed, e.g. "BANQUETS TEAM ROSTER 19/10 TO 25/10".'),
  columns: z
    .array(
      z.object({
        day: dayCode,
        date_text: z.string().nullable().describe('The date printed under the day name, exactly, e.g. "19-Oct-26"; null if unreadable.'),
      }),
    )
    .describe("One entry per day column visible in the image, left to right."),
  function_codes: z
    .array(z.object({ day: dayCode, text: z.string() }))
    .describe('Function-block text above the staff rows for each day that has any, e.g. "195P DDPCT". Not shifts.'),
  staff_names: z
    .array(z.string())
    .describe("Every name in the name column, top to bottom, exactly as printed including bracketed parts."),
  target_rows: z
    .array(
      z.object({
        name_text: z.string().describe("The row's name exactly as printed."),
        row_fully_visible: z.boolean().describe("False if any part of this row is cut off by the image edge or covered."),
        cells: z.array(
          z.object({
            day: dayCode,
            text: z.string().describe('Everything written in the cell, exactly as printed; "" if empty.'),
            fill: z.enum(["none", "red", "other"]).describe('"red" for a solid red cell, "other" for any other colour, "none" for white.'),
            confidence: z.enum(["high", "medium", "low"]),
            doubt: z.string().nullable().describe("What might be misread in this cell, or null."),
          }),
        ),
      }),
    )
    .describe("Every row whose name matches the target name (see instructions)."),
  table_cut_off: z.boolean().describe("True if the table continues past an edge of the image."),
  hard_to_read: z.boolean().describe("True if the image is blurry, angled, glared or low resolution."),
  image_notes: z.string().nullable().describe("Anything else about the image the user should know, or null."),
});

export type ModelRoster = z.infer<typeof modelRosterSchema>;

export type DayResult = {
  day: DayCode;
  dateISO: string;
  /** The cell as transcribed; null when the row has no cell for this day. */
  cellText: string | null;
  fill: CellFill | null;
  reading: CellReading | { kind: "missing" };
  functions: string | null;
  /** Reasons to double-check this day before downloading. */
  checks: string[];
};

export type RosterProblem = "not_roster" | "name_not_found" | "name_ambiguous" | "row_unreadable" | "no_dates";

export type RosterResult =
  | {
      ok: true;
      title: string | null;
      matchedName: string;
      weekStart: string;
      days: DayResult[];
      warnings: string[];
    }
  | {
      ok: false;
      problem: RosterProblem;
      message: string;
      hints: string[];
      staffNames: string[];
    };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad2 = (value: number) => String(value).padStart(2, "0");

function toISO(year: number, month: number, day: number): string | null {
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  return isISODate(iso) ? iso : null;
}

const fullYear = (text: string) => (text.length === 2 ? 2000 + Number(text) : Number(text));

/** "19-Oct-26", "19 Oct 2026", "19/10/26" (day first) → "2026-10-19". */
export function parseColumnDate(text: string | null): string | null {
  if (!text) return null;
  const named = /(\d{1,2})\s*[-/.\s]\s*([A-Za-z]{3,9})\.?\s*[-/.\s]\s*(\d{4}|\d{2})(?!\d)/.exec(text);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    return month ? toISO(fullYear(named[3]), month, Number(named[1])) : null;
  }
  const numeric = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(text);
  if (numeric) return toISO(fullYear(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  return null;
}

/** "… 19/10 TO 25/10" → the first day and month. */
export function parseTitleStart(title: string | null): { day: number; month: number } | null {
  if (!title) return null;
  const match = /(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\s*(?:TO|-|–|—)\s*\d{1,2}\/\d{1,2}/i.exec(title);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { day, month } : null;
}

type Week = { start: string; warnings: string[] };

function findWeek(model: ModelRoster, today: string): Week | null {
  const warnings: string[] = [];
  const parsed = DAY_CODES.map((day, index) => {
    const column = model.columns.find((entry) => entry.day === day);
    const date = parseColumnDate(column?.date_text ?? null);
    return { day, index, text: column?.date_text ?? null, date, anchor: date ? addDays(date, -index) : null };
  });

  const counts = new Map<string, number>();
  for (const entry of parsed) if (entry.anchor) counts.set(entry.anchor, (counts.get(entry.anchor) ?? 0) + 1);
  let start = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const titleStart = parseTitleStart(model.roster_title);
  if (!start && titleStart) {
    // No readable column dates: take the title's day/month in the year (around today) where it is a Monday.
    const year = parseISODate(today).year;
    const options = [year - 1, year, year + 1]
      .map((y) => toISO(y, titleStart.month, titleStart.day))
      .filter((iso): iso is string => iso !== null);
    const closest = (list: string[]) =>
      [...list].sort(
        (a, b) => Math.abs(Date.parse(a) - Date.parse(today)) - Math.abs(Date.parse(b) - Date.parse(today)),
      )[0];
    const mondays = options.filter((iso) => weekdayIndex(iso) === 0);
    start = closest(mondays.length > 0 ? mondays : options) ?? null;
    if (start) warnings.push(`The dates under the days couldn't be read, so the week was taken from the title (${formatDayLabel(start)}). Check the dates.`);
  }
  if (!start) return null;

  for (const entry of parsed) {
    const expected = addDays(start, entry.index);
    if (entry.text && !entry.date) {
      warnings.push(`The date under ${entry.day} ("${entry.text}") couldn't be read; ${formatDayLabel(expected)} was assumed.`);
    } else if (entry.date && entry.date !== expected) {
      warnings.push(`The date under ${entry.day} reads "${entry.text}", but ${formatDayLabel(expected)} was expected. Check the dates.`);
    }
  }
  if (weekdayIndex(start) !== 0) {
    warnings.push(`The first column's date (${formatDayLabel(start)}) is not a Monday. Check the dates.`);
  }
  if (titleStart) {
    const { month, day } = parseISODate(start);
    if (titleStart.month !== month || titleStart.day !== day) {
      warnings.push(`The title says the week starts ${titleStart.day}/${titleStart.month}, but the columns start ${formatDayLabel(start)}.`);
    }
  }
  return { start, warnings };
}

const quote = (names: string[]) => names.map((name) => `"${name}"`).join(", ");

export function buildRoster(model: ModelRoster, targetName: string, today: string): RosterResult {
  const staffNames = model.staff_names;
  const fail = (problem: RosterProblem, message: string, hints: string[] = []): RosterResult => ({
    ok: false,
    problem,
    message,
    hints,
    staffNames,
  });
  const cutOffHint = model.table_cut_off
    ? ["The image looks cropped, so your row may be outside it. Upload a screenshot that shows the whole roster."]
    : [];

  if (!model.is_roster) {
    return fail("not_roster", "This image doesn't look like a work roster.", ["Upload a photo or screenshot of the weekly roster table."]);
  }

  const namedRows = staffNames.filter((name) => nameMatches(name, targetName));
  const rows = model.target_rows.filter((row) => nameMatches(row.name_text, targetName));
  const matches = Math.max(namedRows.length, rows.length);

  if (matches === 0) {
    const similar = similarNames(staffNames, targetName);
    return fail("name_not_found", `No row named "${targetName}" was found on this roster.`, [
      ...(similar.length > 0 ? [`Similar names on the roster: ${quote(similar)}. If one of them is you, change the name in Settings.`] : []),
      ...cutOffHint,
      "Check the name to match in Settings, then read the roster again.",
    ]);
  }
  if (matches > 1) {
    const found = namedRows.length > 1 ? namedRows : rows.map((row) => row.name_text);
    return fail("name_ambiguous", `"${targetName}" matches ${matches} rows: ${quote(found)}. Nothing was guessed.`, [
      'Type your name exactly as written on the roster, including the bracket (for example "Meng (PT)"), in Settings.',
    ]);
  }
  if (rows.length === 0) {
    return fail("row_unreadable", `"${namedRows[0]}" is on the roster, but that row couldn't be read.`, [
      ...cutOffHint,
      "Try a sharper, straighter photo or a screenshot.",
    ]);
  }

  const week = findWeek(model, today);
  if (!week) {
    return fail("no_dates", "The roster's dates couldn't be read, so the shifts can't be placed in the calendar.", [
      "Make sure the title and the dates under the day names are in the image.",
    ]);
  }

  const row = rows[0];
  const warnings = [...week.warnings];
  if (!row.row_fully_visible) {
    warnings.push("Your row looks cut off at the edge of the image. Check every day, or upload an image that shows the whole row.");
  }
  if (model.table_cut_off && row.row_fully_visible) warnings.push("Part of the table is outside the image. Your row looks complete, but check it.");
  if (model.hard_to_read) warnings.push("The image is hard to read (blurry, angled or low resolution). Check each shift carefully.");
  if (model.image_notes) warnings.push(model.image_notes);
  const visibleDays = new Set(model.columns.map((column) => column.day));
  if (visibleDays.size < DAY_CODES.length) {
    warnings.push(`Only ${visibleDays.size} of the 7 day columns are in the image.`);
  }

  const days: DayResult[] = DAY_CODES.map((day, index) => {
    const dateISO = addDays(week.start, index);
    const functions =
      model.function_codes
        .filter((entry) => entry.day === day)
        .map((entry) => entry.text.trim())
        .filter(Boolean)
        .join(" · ") || null;
    const cell = row.cells.find((entry) => entry.day === day);
    if (!cell) {
      return { day, dateISO, cellText: null, fill: null, reading: { kind: "missing" }, functions, checks: ["This day isn't in the image for your row."] };
    }
    const reading = readCell(cell.text, cell.fill);
    const checks: string[] = [];
    if (cell.confidence !== "high") {
      checks.push(cell.doubt ?? (cell.confidence === "low" ? "The reader could barely make out this cell." : "The reader wasn't fully sure about this cell."));
    } else if (cell.doubt) {
      checks.push(cell.doubt);
    }
    if (reading.kind === "shift") checks.push(...reading.problems);
    if (reading.kind === "unclear") checks.push(reading.problem);
    if (cell.fill === "red" && /\d/.test(cell.text)) {
      checks.push(`This red cell also says "${cell.text.trim()}". Red cells count as days off; add the shift if you are working.`);
    }
    return { day, dateISO, cellText: cell.text, fill: cell.fill, reading, functions, checks };
  });

  return { ok: true, title: model.roster_title, matchedName: row.name_text, weekStart: week.start, days, warnings };
}
