import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine } from "@/lib/ics";
import { planShift } from "@/lib/plan";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { plannedWeek } from "./helpers";

const NOW = Date.parse("2026-10-19T02:00:00Z");
const SEPARATE = { ...DEFAULT_SETTINGS, travelStyle: "separate" as const };

/**
 * Parses a file with an independent iCalendar library. Only the VTIMEZONE in
 * the file is registered, so the times below also prove our zone data (and
 * its daylight-saving changes) is right, not just the library's.
 */
function parse(text: string) {
  const calendar = new ICAL.Component(ICAL.parse(text));
  ICAL.TimezoneService.reset();
  for (const zone of calendar.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(zone);
  return calendar.getAllSubcomponents("vevent").map((vevent) => {
    const event = new ICAL.Event(vevent);
    return {
      uid: event.uid,
      summary: event.summary,
      location: event.location,
      description: event.description,
      start: event.startDate.toJSDate().toISOString(),
      end: event.endDate.toJSDate().toISOString(),
      travel: vevent.getFirstPropertyValue("x-apple-travel-duration")?.toString() ?? null,
      alarms: vevent.getAllSubcomponents("valarm").map((alarm) => ({
        action: alarm.getFirstPropertyValue("action"),
        description: alarm.getFirstPropertyValue("description"),
        trigger: String(alarm.getFirstPropertyValue("trigger")),
        related: alarm.getFirstProperty("trigger")?.getParameter("related"),
      })),
    };
  });
}

describe("one shift's file (travel combined, the default)", () => {
  const [monday] = plannedWeek();
  const text = buildCalendar([monday], NOW);

  it("holds one event with Apple travel time and both reminders", () => {
    expect(parse(text)).toEqual([
      {
        uid: "meng-2026-10-19-shift@autocalendar",
        summary: "Work – Banquets (W Melbourne)",
        location: "W Melbourne",
        description: "Shift 0730–1700\nLeave by 7:00 AM (30 min travel).",
        start: "2026-10-18T20:30:00.000Z",
        end: "2026-10-19T06:00:00.000Z",
        travel: "PT30M",
        alarms: [
          { action: "DISPLAY", description: "Start getting ready for work.", trigger: "-PT60M", related: "START" },
          { action: "DISPLAY", description: "Leave soon.", trigger: "-PT45M", related: "START" },
        ],
      },
    ]);
  });

  it("writes Melbourne local time, not GMT", () => {
    expect(text).toContain("DTSTART;TZID=Australia/Melbourne:20261019T073000\r\n");
    expect(text).toContain("DTEND;TZID=Australia/Melbourne:20261019T170000\r\n");
    expect(text).not.toMatch(/^DTSTART:.*Z\r?$/m);
    expect(text).toContain("X-APPLE-TRAVEL-DURATION;VALUE=DURATION:PT30M\r\n");
    expect(text).toContain("TRIGGER;RELATED=START:-PT60M\r\n");
    expect(text).toContain("TRIGGER;RELATED=START:-PT45M\r\n");
  });

  it("describes the zone, with AEDT from 4 Oct 2026 and AEST from 4 Apr 2027", () => {
    expect(text).toContain(
      "BEGIN:DAYLIGHT\r\nDTSTART:20261004T020000\r\nTZOFFSETFROM:+1000\r\nTZOFFSETTO:+1100\r\nTZNAME:AEDT\r\nEND:DAYLIGHT",
    );
    expect(text).toContain(
      "BEGIN:STANDARD\r\nDTSTART:20270404T030000\r\nTZOFFSETFROM:+1100\r\nTZOFFSETTO:+1000\r\nTZNAME:AEST\r\nEND:STANDARD",
    );
    expect(text.indexOf("BEGIN:VTIMEZONE")).toBeLessThan(text.indexOf("BEGIN:VEVENT"));
  });

  it("uses CRLF line ends and lines of at most 75 octets", () => {
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of text.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("one shift's file (travel as a separate event)", () => {
  it("holds the shift and its travel event, with the reminders on travel", () => {
    const [monday] = plannedWeek(undefined, SEPARATE);
    const text = buildCalendar([monday], NOW);
    expect(parse(text)).toEqual([
      {
        uid: "meng-2026-10-19-shift@autocalendar",
        summary: "Work – Banquets (W Melbourne)",
        location: "W Melbourne",
        description: "Shift 0730–1700",
        start: "2026-10-18T20:30:00.000Z",
        end: "2026-10-19T06:00:00.000Z",
        travel: null,
        alarms: [],
      },
      {
        uid: "meng-2026-10-19-travel@autocalendar",
        summary: "Travel to work – W Melbourne",
        location: "W Melbourne",
        description: "Leave by 7:00 AM. Shift starts at 7:30 AM.",
        start: "2026-10-18T20:00:00.000Z",
        end: "2026-10-18T20:30:00.000Z",
        travel: null,
        alarms: [
          { action: "DISPLAY", description: "Start getting ready for work.", trigger: "-PT30M", related: "START" },
          { action: "DISPLAY", description: "Leave soon.", trigger: "-PT15M", related: "START" },
        ],
      },
    ]);
    expect(text).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Start getting ready for work.\r\nTRIGGER;RELATED=START:-PT30M\r\nEND:VALARM");
    expect(text).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Leave soon.\r\nTRIGGER;RELATED=START:-PT15M\r\nEND:VALARM");
  });
});

describe("the week file", () => {
  it("has one event per shift, none for Friday or Sunday, and the overnight shift ends Sunday 3 AM", () => {
    const events = parse(buildCalendar(plannedWeek(), NOW));
    expect(events).toHaveLength(5);
    expect(new Set(events.map((event) => event.uid)).size).toBe(5);
    expect(events.some((event) => event.uid.includes("2026-10-23") || event.uid.includes("2026-10-25"))).toBe(false);
    const saturday = events.find((event) => event.uid === "meng-2026-10-24-shift@autocalendar");
    expect(saturday).toMatchObject({ start: "2026-10-24T05:00:00.000Z", end: "2026-10-24T16:00:00.000Z" });
  });

  it("has ten events when travel is separate", () => {
    expect(parse(buildCalendar(plannedWeek(undefined, SEPARATE), NOW))).toHaveLength(10);
  });

  it("keeps IDs on a re-export but marks it as newer", () => {
    const first = buildCalendar(plannedWeek(), NOW);
    const later = buildCalendar(plannedWeek(), NOW + 3_600_000);
    expect(parse(later).map((event) => event.uid)).toEqual(parse(first).map((event) => event.uid));
    const sequence = (text: string) => Number(/SEQUENCE:(\d+)/.exec(text)?.[1]);
    expect(sequence(later)).toBeGreaterThan(sequence(first));
  });
});

describe("daylight saving in the files", () => {
  const draft = (dateISO: string, start: number, end: number) => ({ dateISO, slot: 0, start, end, note: null, functions: null });

  it("keeps an overnight shift across the October change at its real times", () => {
    const text = buildCalendar([planShift(draft("2026-10-03", 960, 1620), DEFAULT_SETTINGS)], NOW);
    expect(text).toContain("DTSTART;TZID=Australia/Melbourne:20261003T160000");
    expect(text).toContain("DTEND;TZID=Australia/Melbourne:20261004T030000");
    expect(parse(text)[0]).toMatchObject({ start: "2026-10-03T06:00:00.000Z", end: "2026-10-03T16:00:00.000Z" });
  });

  it("writes a time in the repeated April hour in UTC, so it isn't read as the first 2:30", () => {
    // Shift 3:00 AM on Sun 4 Apr 2027; separate travel starts at the second 2:30 AM (AEST).
    const plan = planShift(draft("2027-04-04", 180, 600), SEPARATE);
    const text = buildCalendar([plan], NOW);
    expect(text).toContain("DTSTART:20270403T163000Z");
    expect(parse(text)[1]).toMatchObject({ start: "2027-04-03T16:30:00.000Z", end: "2027-04-03T17:00:00.000Z" });
  });

  it("covers events in other zones too", () => {
    const text = buildCalendar([planShift(draft("2026-10-19", 450, 1020), { ...DEFAULT_SETTINGS, timeZone: "Australia/Brisbane" })], NOW);
    expect(text).toContain("TZID:Australia/Brisbane");
    expect(parse(text)[0].start).toBe("2026-10-18T21:30:00.000Z");
  });
});

describe("text handling", () => {
  it("escapes commas, semicolons, backslashes and new lines", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const settings = { ...DEFAULT_SETTINGS, venueAddress: "1 Example St, Melbourne VIC 3000" };
    const [monday] = plannedWeek(undefined, settings);
    const [shift] = parse(buildCalendar([monday], NOW));
    expect(shift.location).toBe("W Melbourne, 1 Example St, Melbourne VIC 3000");
  });

  it("folds long lines without splitting a character", () => {
    const line = `DESCRIPTION:${"Shift – night ".repeat(12)}`;
    const folded = foldLine(line);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    for (const piece of folded.split("\r\n")) expect(new TextEncoder().encode(piece).length).toBeLessThanOrEqual(75);
  });

  it("round-trips a long note with symbols", () => {
    const [monday] = plannedWeek();
    const note = "Purchasing; bring keys, badge & the “blue” folder — then check the cool room at the end of the shift please";
    const event = { ...monday.events[0], description: `Shift 0730–1700\n${note}` };
    expect(parse(buildCalendar([{ ...monday, events: [event] }], NOW))[0].description).toBe(`Shift 0730–1700\n${note}`);
  });
});
