import { describe, expect, it } from "vitest";
import {
  addDays,
  formatClock,
  formatClockRange,
  formatDayLabel,
  formatRosterTime,
  instantToWall,
  isValidTimeZone,
  offsetMinutes,
  wallTimeToInstant,
  weekdayIndex,
} from "@/lib/time";

const MEL = "Australia/Melbourne";
const iso = (instant: number) => new Date(instant).toISOString();

describe("Melbourne wall time to instant", () => {
  it("uses AEDT (+11) in October after daylight saving starts", () => {
    expect(iso(wallTimeToInstant("2026-10-19", 7 * 60 + 30, MEL))).toBe("2026-10-18T20:30:00.000Z");
  });

  it("uses AEST (+10) in winter", () => {
    expect(iso(wallTimeToInstant("2026-07-01", 9 * 60, MEL))).toBe("2026-06-30T23:00:00.000Z");
  });

  it("puts an end past 2400 on the next day (1600 - 2700 ends 3:00 AM)", () => {
    const end = wallTimeToInstant("2026-10-24", 27 * 60, MEL);
    expect(iso(end)).toBe("2026-10-24T16:00:00.000Z");
    expect(instantToWall(end, MEL)).toEqual({ dateISO: "2026-10-25", minutes: 180 });
  });

  it("moves a time inside the spring-forward gap forward (2:30 AM on 4 Oct 2026 → 3:30 AM AEDT)", () => {
    const instant = wallTimeToInstant("2026-10-04", 150, MEL);
    expect(iso(instant)).toBe("2026-10-03T16:30:00.000Z");
    expect(instantToWall(instant, MEL)).toEqual({ dateISO: "2026-10-04", minutes: 210 });
  });

  it("takes the earlier of a repeated autumn time (2:30 AM on 4 Apr 2027 is AEDT)", () => {
    expect(iso(wallTimeToInstant("2027-04-04", 150, MEL))).toBe("2027-04-03T15:30:00.000Z");
  });

  it("knows the offsets either side of the change", () => {
    expect(offsetMinutes(Date.parse("2026-10-03T15:59:00Z"), MEL)).toBe(600);
    expect(offsetMinutes(Date.parse("2026-10-03T16:00:00Z"), MEL)).toBe(660);
  });

  it("works for other zones", () => {
    expect(iso(wallTimeToInstant("2026-10-19", 9 * 60, "Europe/London"))).toBe("2026-10-19T08:00:00.000Z");
    expect(iso(wallTimeToInstant("2026-10-19", 9 * 60, "UTC"))).toBe("2026-10-19T09:00:00.000Z");
  });
});

describe("formatting", () => {
  it("formats clock times like the roster table", () => {
    expect(formatClock(Date.parse("2026-10-18T20:30:00Z"), MEL)).toBe("7:30 AM");
    expect(formatClock(Date.parse("2026-10-19T01:00:00Z"), MEL)).toBe("12:00 PM");
    expect(formatClock(Date.parse("2026-10-24T13:00:00Z"), MEL)).toBe("12:00 AM");
  });

  it("shares AM/PM in a range when both halves agree", () => {
    expect(formatClockRange(Date.parse("2026-10-18T20:00:00Z"), Date.parse("2026-10-18T20:30:00Z"), MEL)).toBe("7:00 – 7:30 AM");
    expect(formatClockRange(Date.parse("2026-10-19T00:45:00Z"), Date.parse("2026-10-19T01:15:00Z"), MEL)).toBe("11:45 AM – 12:15 PM");
  });

  it("labels days and roster times", () => {
    expect(formatDayLabel("2026-10-19")).toBe("Mon 19 Oct");
    expect(formatDayLabel("2026-10-25")).toBe("Sun 25 Oct");
    expect(formatRosterTime(27 * 60)).toBe("2700");
    expect(formatRosterTime(6 * 60 + 15)).toBe("0615");
  });

  it("does date arithmetic across months and years", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-28", 6)).toBe("2027-01-03");
    expect(weekdayIndex("2026-10-19")).toBe(0);
    expect(weekdayIndex("2026-10-25")).toBe(6);
  });

  it("validates time zone names", () => {
    expect(isValidTimeZone(MEL)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
