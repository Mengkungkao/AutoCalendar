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
 * shift event, its travel (Apple travel time on the shift, or a separate
 * travel event ending when the shift starts), and the reminders timed from
 * the start of travel. The preview and the calendar files both come from
 * planShift, so they cannot disagree.
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
  /** Reminders; `minutes` counts back from this event's start. */
  alarms: { minutes: number; message: string; at: number }[];
  /** Apple Calendar "Travel Time" shown above the event (combined style only). */
  travelMinutes?: number;
};

export type PlannedShift = {
  draft: ShiftDraft;
  /** The IANA zone the times are written in (Settings → Time zone). */
  timeZone: string;
  dayLabel: string;
  fileName: string;
  /** Instants: when travel starts, and when the shift starts and ends. */
  times: { travelStart: number; start: number; end: number };
  /**
   * What goes in the calendar file. "combined": one shift event carrying
   * Apple travel time, its reminders counted from the start of travel.
   * "separate": the shift event, then a travel event with the reminders.
   */
  events: PlannedEvent[];
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
  // Reminders are timed from the start of travel, whichever event carries them.
  const reminders = settings.reminders.map((reminder) => ({ ...reminder, at: travelStart - reminder.minutes * MINUTE_MS }));

  const slot = draft.slot > 0 ? `-${draft.slot + 1}` : "";
  const id = `${slugify(settings.name)}-${draft.dateISO}${slot}`;
  const location = venueLocation(settings);
  const leaveBy = formatClock(travelStart, zone);

  const shiftLine = `Shift ${formatRosterTime(draft.start)}–${formatRosterTime(draft.end)}`;
  const extras: string[] = [];
  if (draft.note) extras.push(draft.note);
  if (settings.includeFunctionCodes && draft.functions) extras.push(`Functions: ${draft.functions}`);

  const shiftEvent: PlannedEvent = {
    uid: `${id}-shift@autocalendar`,
    start,
    end,
    summary: settings.shiftTitle,
    location,
    description: [shiftLine, ...extras].join("\n"),
    alarms: [],
  };
  const events: PlannedEvent[] =
    settings.travelStyle === "combined"
      ? [
          {
            ...shiftEvent,
            description: [shiftLine, `Leave by ${leaveBy} (${settings.travelMinutes} min travel).`, ...extras].join("\n"),
            alarms: reminders.map((reminder) => ({ ...reminder, minutes: reminder.minutes + settings.travelMinutes })),
            travelMinutes: settings.travelMinutes,
          },
        ]
      : [
          shiftEvent,
          {
            uid: `${id}-travel@autocalendar`,
            start: travelStart,
            end: start,
            summary: settings.travelTitle,
            location,
            description: `Leave by ${leaveBy}. Shift starts at ${formatClock(start, zone)}.`,
            alarms: reminders,
          },
        ];

  const endDate = instantToWall(end, zone).dateISO;
  const endsOn = endDate !== draft.dateISO ? WEEKDAYS_SHORT[weekdayIndex(endDate)] : null;

  return {
    draft,
    timeZone: zone,
    dayLabel: formatDayLabel(draft.dateISO),
    fileName: `shift-${dayFilePart(draft.dateISO)}${slot}.ics`,
    times: { travelStart, start, end },
    events,
    display: {
      shift: `${formatClock(start, zone)} – ${formatClock(end, zone)}${endsOn ? ` ${endsOn}` : ""}`,
      travel: formatClockRange(travelStart, start, zone),
      reminders: reminders.map((reminder) => ({ time: formatClock(reminder.at, zone), message: reminder.message })),
      endsOn,
    },
  };
}

export function weekFileName(weekStart: string): string {
  const { month, day } = parseISODate(weekStart);
  return `shifts-week-of-${day}-${MONTHS_SHORT[month - 1].toLowerCase()}.ics`;
}
