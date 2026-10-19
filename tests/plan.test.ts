import { describe, expect, it } from "vitest";
import { planShift, slugify, weekFileName, type ShiftDraft } from "@/lib/plan";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { plannedWeek, previewTable } from "./helpers";

const iso = (instant: number) => new Date(instant).toISOString();
const draft = (dateISO: string, start: number, end: number, changes: Partial<ShiftDraft> = {}): ShiftDraft => ({
  dateISO,
  slot: 0,
  start,
  end,
  note: null,
  functions: null,
  ...changes,
});

describe("the expected result for the 19–25 Oct roster", () => {
  it("matches the table exactly", () => {
    expect(previewTable()).toEqual([
      { day: "Mon 19 Oct", shift: "7:30 AM – 5:00 PM", travel: "7:00 – 7:30 AM", reminder1: "6:30 AM", reminder2: "6:45 AM" },
      { day: "Tue 20 Oct", shift: "6:30 AM – 4:00 PM", travel: "6:00 – 6:30 AM", reminder1: "5:30 AM", reminder2: "5:45 AM" },
      { day: "Wed 21 Oct", shift: "6:15 AM – 4:00 PM", travel: "5:45 – 6:15 AM", reminder1: "5:15 AM", reminder2: "5:30 AM" },
      { day: "Thu 22 Oct", shift: "8:00 AM – 6:00 PM", travel: "7:30 – 8:00 AM", reminder1: "7:00 AM", reminder2: "7:15 AM" },
      { day: "Sat 24 Oct", shift: "4:00 PM – 3:00 AM Sun", travel: "3:30 – 4:00 PM", reminder1: "3:00 PM", reminder2: "3:15 PM" },
    ]);
  });

  it("names the files by day", () => {
    expect(plannedWeek().map((plan) => plan.fileName)).toEqual([
      "shift-mon-19-oct.ics",
      "shift-tue-20-oct.ics",
      "shift-wed-21-oct.ics",
      "shift-thu-22-oct.ics",
      "shift-sat-24-oct.ics",
    ]);
    expect(weekFileName("2026-10-19")).toBe("shifts-week-of-19-oct.ics");
  });

  it("builds event IDs from the name, date and event type", () => {
    const [monday] = plannedWeek();
    expect(monday.shift.uid).toBe("meng-2026-10-19-shift@autocalendar");
    expect(monday.travel.uid).toBe("meng-2026-10-19-travel@autocalendar");
  });

  it("gives identical IDs when the same roster is read twice", () => {
    const first = plannedWeek().flatMap((plan) => [plan.shift.uid, plan.travel.uid]);
    const second = plannedWeek().flatMap((plan) => [plan.shift.uid, plan.travel.uid]);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(10);
  });

  it("writes the travel and shift notes", () => {
    const [monday, , , , saturday] = plannedWeek();
    expect(monday.shift.summary).toBe("Work – Banquets (W Melbourne)");
    expect(monday.shift.location).toBe("W Melbourne");
    expect(monday.shift.description).toBe("Shift 0730–1700");
    expect(monday.travel.summary).toBe("Travel to work – W Melbourne");
    expect(monday.travel.description).toBe("Leave by 7:00 AM. Shift starts at 7:30 AM.");
    expect(saturday.shift.description).toBe("Shift 1600–2700");
    expect(iso(saturday.shift.end)).toBe("2026-10-24T16:00:00.000Z");
  });

  it("adds function codes to the notes only when the setting is on", () => {
    const off = plannedWeek()[0];
    const on = plannedWeek(undefined, { ...DEFAULT_SETTINGS, includeFunctionCodes: true })[0];
    expect(off.shift.description).toBe("Shift 0730–1700");
    expect(on.shift.description).toBe("Shift 0730–1700\nFunctions: 195P DDPCT");
  });
});

describe("settings", () => {
  it("uses the travel time and reminders from settings", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      travelMinutes: 45,
      reminders: [
        { minutes: 60, message: "Shower." },
        { minutes: 10, message: "Keys!" },
      ],
    };
    const plan = planShift(draft("2026-10-19", 450, 1020), settings);
    expect(plan.display.travel).toBe("6:45 – 7:30 AM");
    expect(plan.display.reminders).toEqual([
      { time: "5:45 AM", message: "Shower." },
      { time: "6:35 AM", message: "Keys!" },
    ]);
    expect(plan.travel.description).toBe("Leave by 6:45 AM. Shift starts at 7:30 AM.");
  });

  it("puts the address in the location when there is one", () => {
    const plan = planShift(draft("2026-10-19", 450, 1020), { ...DEFAULT_SETTINGS, venueAddress: "1 Example St, Melbourne VIC 3000" });
    expect(plan.shift.location).toBe("W Melbourne, 1 Example St, Melbourne VIC 3000");
  });

  it("slugs the name for IDs", () => {
    expect(slugify("Meng (PT)")).toBe("meng-pt");
    expect(slugify("Zoë")).toBe("zoe");
    expect(slugify("()")).toBe("staff");
  });

  it("numbers a second shift on the same day", () => {
    const plan = planShift(draft("2026-10-19", 1020, 1320, { slot: 1 }), DEFAULT_SETTINGS);
    expect(plan.shift.uid).toBe("meng-2026-10-19-2-shift@autocalendar");
    expect(plan.fileName).toBe("shift-mon-19-oct-2.ics");
  });
});

describe("daylight saving (Melbourne: starts 4 Oct 2026, ends 4 Apr 2027)", () => {
  it("keeps an overnight shift into the clock change at its real length", () => {
    // Sat 3 Oct 1600 - 2700: the clocks jump at 2:00 AM, so it lasts 10 hours, not 11.
    const plan = planShift(draft("2026-10-03", 960, 1620), DEFAULT_SETTINGS);
    expect(plan.display).toMatchObject({ shift: "4:00 PM – 3:00 AM Sun", travel: "3:30 – 4:00 PM" });
    expect((plan.shift.end - plan.shift.start) / 3_600_000).toBe(10);
    expect(iso(plan.shift.start)).toBe("2026-10-03T06:00:00.000Z");
  });

  it("times travel and reminders correctly on the morning of the change", () => {
    const plan = planShift(draft("2026-10-04", 450, 1020), DEFAULT_SETTINGS);
    expect(plan.display.travel).toBe("7:00 – 7:30 AM");
    expect(plan.display.reminders.map((reminder) => reminder.time)).toEqual(["6:30 AM", "6:45 AM"]);
    expect(iso(plan.travel.start)).toBe("2026-10-03T20:00:00.000Z");
  });

  it("keeps travel at 30 real minutes when it crosses the jump", () => {
    // Shift at 3:00 AM AEDT; 30 minutes earlier the clock read 1:30 AM AEST.
    const plan = planShift(draft("2026-10-04", 180, 600), DEFAULT_SETTINGS);
    expect(plan.travel.start - plan.shift.start).toBe(-30 * 60_000);
    expect(plan.display.travel).toBe("1:30 – 3:00 AM");
    expect(plan.display.reminders.map((reminder) => reminder.time)).toEqual(["1:00 AM", "1:15 AM"]);
  });

  it("adds the repeated hour to an overnight shift when daylight saving ends", () => {
    const plan = planShift(draft("2027-04-03", 960, 1620), DEFAULT_SETTINGS);
    expect(plan.display.shift).toBe("4:00 PM – 3:00 AM Sun");
    expect((plan.shift.end - plan.shift.start) / 3_600_000).toBe(12);
  });

  it("times reminders through the repeated hour by the real clock", () => {
    const plan = planShift(draft("2027-04-04", 180, 600), DEFAULT_SETTINGS);
    expect(iso(plan.shift.start)).toBe("2027-04-03T17:00:00.000Z");
    expect(plan.display.travel).toBe("2:30 – 3:00 AM");
    expect(plan.display.reminders.map((reminder) => reminder.time)).toEqual(["2:00 AM", "2:15 AM"]);
  });
});
