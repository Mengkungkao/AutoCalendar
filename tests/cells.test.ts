import { describe, expect, it } from "vitest";
import { readCell } from "@/lib/cells";

describe("readCell", () => {
  it("reads a 24-hour range", () => {
    expect(readCell("0730 - 1700", "none")).toEqual({
      kind: "shift",
      ranges: [{ start: 450, end: 1020, text: "0730 - 1700" }],
      note: null,
      problems: [],
    });
  });

  it("accepts the usual ways of writing a range", () => {
    for (const text of ["0730-1700", "730 - 1700", "07:30 – 17:00", "07.30—17.00", "0730 to 1700"]) {
      const reading = readCell(text, "none");
      expect(reading.kind, text).toBe("shift");
      if (reading.kind === "shift") expect([reading.ranges[0].start, reading.ranges[0].end], text).toEqual([450, 1020]);
    }
  });

  it("treats an end above 2400 as the next day", () => {
    const reading = readCell("1600 - 2700", "none");
    expect(reading).toMatchObject({ kind: "shift", ranges: [{ start: 960, end: 1620 }], problems: [] });
  });

  it("keeps extra words as a note", () => {
    expect(readCell("0730 - 1700 Purchasing", "none")).toMatchObject({ kind: "shift", note: "Purchasing" });
    expect(readCell("Purchasing\n0730-1700", "none")).toMatchObject({ kind: "shift", note: "Purchasing" });
    expect(readCell("0730 - 1700 (Purchasing)", "other")).toMatchObject({ kind: "shift", note: "Purchasing" });
  });

  it("gives no shift for OFF, blank and red cells", () => {
    expect(readCell("OFF", "none")).toEqual({ kind: "off", reason: "off" });
    expect(readCell(" off ", "none")).toEqual({ kind: "off", reason: "off" });
    expect(readCell("", "none")).toEqual({ kind: "off", reason: "blank" });
    expect(readCell("   ", "none")).toEqual({ kind: "off", reason: "blank" });
    expect(readCell("", "red")).toEqual({ kind: "off", reason: "red" });
    expect(readCell("0730 - 1700", "red")).toEqual({ kind: "off", reason: "red" });
  });

  it("flags an end earlier than the start instead of silently accepting it", () => {
    const reading = readCell("1600 - 0300", "none");
    expect(reading).toMatchObject({ kind: "shift", ranges: [{ start: 960, end: 1620 }] });
    if (reading.kind === "shift") expect(reading.problems[0]).toMatch(/next day/);
  });

  it("flags implausible lengths", () => {
    const long = readCell("0500 - 2300", "none");
    if (long.kind === "shift") expect(long.problems.join()).toMatch(/16 hours/);
    const short = readCell("0700 - 0730", "none");
    if (short.kind === "shift") expect(short.problems.join()).toMatch(/shorter than an hour/);
  });

  it("splits a cell with two ranges into two shifts", () => {
    const reading = readCell("0700 - 1100 / 1700 - 2200", "none");
    expect(reading).toMatchObject({ kind: "shift", ranges: [{ start: 420, end: 660 }, { start: 1020, end: 1320 }] });
  });

  it("calls text without times unclear rather than guessing", () => {
    expect(readCell("AL", "none")).toEqual({ kind: "unclear", problem: 'No shift times found in "AL".' });
    expect(readCell("Purchasing", "none").kind).toBe("unclear");
    expect(readCell("2500 - 2700", "none").kind).toBe("unclear");
    expect(readCell("0790 - 1700", "none").kind).toBe("unclear");
  });
});
