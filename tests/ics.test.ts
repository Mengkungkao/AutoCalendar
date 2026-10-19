import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine } from "@/lib/ics";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { plannedWeek } from "./helpers";

const NOW = Date.parse("2026-10-19T02:00:00Z");

function parse(text: string) {
  const calendar = new ICAL.Component(ICAL.parse(text));
  return calendar.getAllSubcomponents("vevent").map((vevent) => {
    const event = new ICAL.Event(vevent);
    return {
      uid: event.uid,
      summary: event.summary,
      location: event.location,
      description: event.description,
      start: event.startDate.toJSDate().toISOString(),
      end: event.endDate.toJSDate().toISOString(),
      alarms: vevent.getAllSubcomponents("valarm").map((alarm) => ({
        action: alarm.getFirstPropertyValue("action"),
        description: alarm.getFirstPropertyValue("description"),
        trigger: String(alarm.getFirstPropertyValue("trigger")),
        related: alarm.getFirstProperty("trigger")?.getParameter("related"),
      })),
    };
  });
}

describe("one shift's file", () => {
  const [monday] = plannedWeek();
  const text = buildCalendar([monday], NOW);

  it("holds the shift and its travel event", () => {
    expect(parse(text)).toEqual([
      {
        uid: "meng-2026-10-19-shift@autocalendar",
        summary: "Work – Banquets (W Melbourne)",
        location: "W Melbourne",
        description: "Shift 0730–1700",
        start: "2026-10-18T20:30:00.000Z",
        end: "2026-10-19T06:00:00.000Z",
        alarms: [],
      },
      {
        uid: "meng-2026-10-19-travel@autocalendar",
        summary: "Travel to work – W Melbourne",
        location: "W Melbourne",
        description: "Leave by 7:00 AM. Shift starts at 7:30 AM.",
        start: "2026-10-18T20:00:00.000Z",
        end: "2026-10-18T20:30:00.000Z",
        alarms: [
          { action: "DISPLAY", description: "Start getting ready for work.", trigger: "-PT30M", related: "START" },
          { action: "DISPLAY", description: "Leave soon.", trigger: "-PT15M", related: "START" },
        ],
      },
    ]);
  });

  it("writes the reminder triggers exactly as specified", () => {
    expect(text).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Start getting ready for work.\r\nTRIGGER;RELATED=START:-PT30M\r\nEND:VALARM");
    expect(text).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Leave soon.\r\nTRIGGER;RELATED=START:-PT15M\r\nEND:VALARM");
    expect(text.match(/BEGIN:VALARM/g)).toHaveLength(2);
  });

  it("uses CRLF line ends, UTC times and lines of at most 75 octets", () => {
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(text).toContain("DTSTART:20261018T203000Z");
    for (const line of text.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("the week file", () => {
  it("has ten events with unique IDs, and none for Friday or Sunday", () => {
    const events = parse(buildCalendar(plannedWeek(), NOW));
    expect(events).toHaveLength(10);
    expect(new Set(events.map((event) => event.uid)).size).toBe(10);
    expect(events.some((event) => event.uid.includes("2026-10-23") || event.uid.includes("2026-10-25"))).toBe(false);
    const saturday = events.find((event) => event.uid === "meng-2026-10-24-shift@autocalendar");
    expect(saturday).toMatchObject({ start: "2026-10-24T05:00:00.000Z", end: "2026-10-24T16:00:00.000Z" });
  });

  it("keeps IDs on a re-export but marks it as newer", () => {
    const first = buildCalendar(plannedWeek(), NOW);
    const later = buildCalendar(plannedWeek(), NOW + 3_600_000);
    expect(parse(later).map((event) => event.uid)).toEqual(parse(first).map((event) => event.uid));
    const sequence = (text: string) => Number(/SEQUENCE:(\d+)/.exec(text)?.[1]);
    expect(sequence(later)).toBeGreaterThan(sequence(first));
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
    const plan = { ...monday, shift: { ...monday.shift, description: `Shift 0730–1700\n${note}` } };
    expect(parse(buildCalendar([plan], NOW))[0].description).toBe(`Shift 0730–1700\n${note}`);
  });
});
