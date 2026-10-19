import { describe, expect, it } from "vitest";
import { wallTimeToInstant } from "@/lib/time";
import { formatLocalDateTime, formatOffset, localTimeIsExact, offsetTransitions, vtimezoneLines, zoneAbbreviation } from "@/lib/vtimezone";

const MEL = "Australia/Melbourne";

describe("zone data for calendar files", () => {
  it("finds Melbourne's daylight-saving changes to the minute", () => {
    const changes = offsetTransitions(MEL, Date.UTC(2026, 0, 1), Date.UTC(2028, 0, 1));
    expect(changes.map(({ at, from, to }) => ({ at: new Date(at).toISOString(), from, to }))).toEqual([
      { at: "2026-04-04T16:00:00.000Z", from: 660, to: 600 },
      { at: "2026-10-03T16:00:00.000Z", from: 600, to: 660 },
      { at: "2027-04-03T16:00:00.000Z", from: 660, to: 600 },
      { at: "2027-10-02T16:00:00.000Z", from: 600, to: 660 },
    ]);
  });

  it("names Melbourne time AEDT in summer and AEST in winter", () => {
    expect(zoneAbbreviation(Date.parse("2026-10-19T00:00:00Z"), MEL)).toBe("AEDT");
    expect(zoneAbbreviation(Date.parse("2026-07-01T00:00:00Z"), MEL)).toBe("AEST");
  });

  it("formats offsets and local times", () => {
    expect(formatOffset(660)).toBe("+1100");
    expect(formatOffset(-210)).toBe("-0330");
    expect(formatLocalDateTime(Date.parse("2026-10-18T20:30:00Z"), MEL)).toBe("20261019T073000");
  });

  it("spots times in the repeated autumn hour", () => {
    const firstHalfPastTwo = wallTimeToInstant("2027-04-04", 150, MEL); // 2:30 AEDT
    expect(localTimeIsExact(firstHalfPastTwo, MEL)).toBe(true);
    expect(localTimeIsExact(firstHalfPastTwo + 3_600_000, MEL)).toBe(false); // 2:30 AEST
  });

  it("describes a zone without daylight saving with one observance", () => {
    const lines = vtimezoneLines("Australia/Brisbane", [Date.parse("2026-10-19T00:00:00Z")]);
    expect(lines).toEqual([
      "BEGIN:VTIMEZONE",
      "TZID:Australia/Brisbane",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+1000",
      "TZOFFSETTO:+1000",
      "TZNAME:AEST",
      "END:STANDARD",
      "END:VTIMEZONE",
    ]);
  });
});
