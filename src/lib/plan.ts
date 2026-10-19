import { z } from "zod";
import type { Settings } from "./settings";
import {
  MINUTE_MS,
  MONTHS_SHORT,
  WEEKDAYS_SHORT,
  formatClock,
  formatClockRange,
  formatRosterTime,
  instantToWall,
  isISODate,
  parseISODate,
  wallTimeToInstant,
  weekdayIndex,
  formatDayLabel,
} from "./time";

/**
 * One shift as the user confirmed it, and everything derived from it: the
 * shift event, the travel event that ends when the shift starts, and the
 * reminders timed from the start of travel. The preview and the calendar
 * files both come from planShift, so they cannot disagree.
 */

export const shiftDraftSchema = z
  .object({
    dateISO: z.string().refine(isISODate, "Invalid date."),
    /** 0 for the day's first shift; a cell with two ranges gives slots 0 and 1. */
    slot: z.number().int().min(0).max(5),
    /** Minutes after midnight of dateISO. */
    start: z.number().int().min(0).max(1439),
    /** Minutes after midnight of dateISO; above 1440 ends the next day. */
    end: z.number().int().min(1).max(2880),
    note: z.string().max(200).nullable(),
    /** Function-block codes for the day; used only when the setting is on. */
    functions: z.string().max(200).nullable(),
  })
  .refine((shift) => shift.end > shift.start && shift.end - shift.start <= 1440, {
    message: "A shift must end after it starts and last at most 24 hours.",
  });

export type ShiftDraft = z.infer<typeof shiftDraftSchema>;

export type PlannedEvent = {
  uid: string;
  start: number;
  end: number;
  summary: string;
  location: string;
  description: string;
  alarms: { minutes: number; message: string; at: number }[];
};

export type PlannedShift = {
  draft: ShiftDraft;
  dayLabel: string;
  fileName: string;
  shift: PlannedEvent;
  travel: PlannedEvent;
  display: {
    shift: string;
    travel: string;
    reminders: { time: string; message: string }[];
    /** Weekday the shift ends on when that is the next day ("Sun"), else null. */
    endsOn: string | null;
  };
};

export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "staff";
}

function dayFilePart(dateISO: string): string {
  const { month, day } = parseISODate(dateISO);
  return `${WEEKDAYS_SHORT[weekdayIndex(dateISO)]}-${day}-${MONTHS_SHORT[month - 1]}`.toLowerCase();
}

export function venueLocation(settings: Settings): string {
  return settings.venueAddress ? `${settings.venueName}, ${settings.venueAddress}` : settings.venueName;
}

export function planShift(draft: ShiftDraft, settings: Settings): PlannedShift {
  const zone = settings.timeZone;
  const start = wallTimeToInstant(draft.dateISO, draft.start, zone);
  const end = wallTimeToInstant(draft.dateISO, draft.end, zone);
  const travelStart = start - settings.travelMinutes * MINUTE_MS;
  const alarms = settings.reminders.map((reminder) => ({ ...reminder, at: travelStart - reminder.minutes * MINUTE_MS }));

  const slot = draft.slot > 0 ? `-${draft.slot + 1}` : "";
  const id = `${slugify(settings.name)}-${draft.dateISO}${slot}`;
  const location = venueLocation(settings);

  const notes = [`Shift ${formatRosterTime(draft.start)}–${formatRosterTime(draft.end)}`];
  if (draft.note) notes.push(draft.note);
  if (settings.includeFunctionCodes && draft.functions) notes.push(`Functions: ${draft.functions}`);

  const endDate = instantToWall(end, zone).dateISO;
  const endsOn = endDate !== draft.dateISO ? WEEKDAYS_SHORT[weekdayIndex(endDate)] : null;

  return {
    draft,
    dayLabel: formatDayLabel(draft.dateISO),
    fileName: `shift-${dayFilePart(draft.dateISO)}${slot}.ics`,
    shift: {
      uid: `${id}-shift@autocalendar`,
      start,
      end,
      summary: settings.shiftTitle,
      location,
      description: notes.join("\n"),
      alarms: [],
    },
    travel: {
      uid: `${id}-travel@autocalendar`,
      start: travelStart,
      end: start,
      summary: settings.travelTitle,
      location,
      description: `Leave by ${formatClock(travelStart, zone)}. Shift starts at ${formatClock(start, zone)}.`,
      alarms,
    },
    display: {
      shift: `${formatClock(start, zone)} – ${formatClock(end, zone)}${endsOn ? ` ${endsOn}` : ""}`,
      travel: formatClockRange(travelStart, start, zone),
      reminders: alarms.map((alarm) => ({ time: formatClock(alarm.at, zone), message: alarm.message })),
      endsOn,
    },
  };
}

export function weekFileName(weekStart: string): string {
  const { month, day } = parseISODate(weekStart);
  return `shifts-week-of-${day}-${MONTHS_SHORT[month - 1].toLowerCase()}.ics`;
}
