import { describe, expect, it } from "vitest";
import { dayEntries } from "@/lib/days";
import { buildRoster, parseColumnDate, parseTitleStart, type ModelRoster } from "@/lib/roster";
import { TODAY, fixture, okRoster } from "./helpers";

const withRow = (model: ModelRoster, changes: Partial<ModelRoster["target_rows"][number]>): ModelRoster => ({
  ...model,
  target_rows: [{ ...model.target_rows[0], ...changes }],
});

describe("buildRoster on the 19–25 Oct roster", () => {
  const roster = okRoster(buildRoster(fixture(), "Meng", TODAY));

  it("finds Meng's row and the week", () => {
    expect(roster.matchedName).toBe("Meng (PT)");
    expect(roster.weekStart).toBe("2026-10-19");
    expect(roster.days.map((day) => day.dateISO)).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25",
    ]);
    expect(roster.warnings).toEqual([]);
  });

  it("gives shifts Monday to Thursday and Saturday, and none Friday or Sunday", () => {
    expect(roster.days.map((day) => day.reading.kind)).toEqual(["shift", "shift", "shift", "shift", "off", "shift", "off"]);
    expect(roster.days[4].reading).toEqual({ kind: "off", reason: "off" });
    expect(roster.days[6].reading).toEqual({ kind: "off", reason: "red" });
    expect(dayEntries(roster).flatMap((day) => day.shifts)).toHaveLength(5);
  });

  it("keeps the function codes per day without making them shifts", () => {
    expect(roster.days[0].functions).toBe("195P DDPCT");
    expect(roster.days[5].functions).toBe("220P WEDDING");
    expect(roster.days[1].functions).toBeNull();
  });

  it("asks for a check on cells the model was unsure about", () => {
    const model = fixture();
    model.target_rows[0].cells[2] = { ...model.target_rows[0].cells[2], confidence: "medium", doubt: "The 15 could be 45." };
    const result = okRoster(buildRoster(model, "Meng", TODAY));
    expect(result.days[2].checks).toEqual(["The 15 could be 45."]);
    expect(result.days[0].checks).toEqual([]);
  });
});

describe("finding the row", () => {
  it("says so when the name is on no row, with similar names", () => {
    const model = { ...fixture(), staff_names: ["Alex (FT)", "Mengyu (PT)"], target_rows: [] };
    const result = buildRoster(model, "Meng", TODAY);
    expect(result).toMatchObject({ ok: false, problem: "name_not_found" });
    if (!result.ok) {
      expect(result.message).toBe('No row named "Meng" was found on this roster.');
      expect(result.hints[0]).toContain('"Mengyu (PT)"');
      expect(result.staffNames).toEqual(["Alex (FT)", "Mengyu (PT)"]);
    }
  });

  it("refuses to guess when the name is on two rows", () => {
    const model = fixture();
    model.staff_names = ["Meng (FT)", "Alex", "Meng (PT)"];
    const result = buildRoster(model, "Meng", TODAY);
    expect(result).toMatchObject({ ok: false, problem: "name_ambiguous" });
    if (!result.ok) expect(result.message).toContain('"Meng (FT)", "Meng (PT)"');
  });

  it("tells two Mengs apart when the bracket is given", () => {
    const model = fixture();
    model.staff_names = ["Meng (FT)", "Meng (PT)"];
    model.target_rows = [{ ...model.target_rows[0], name_text: "Meng (FT)", cells: [] }, model.target_rows[0]];
    const result = okRoster(buildRoster(model, "Meng (PT)", TODAY));
    expect(result.matchedName).toBe("Meng (PT)");
    expect(result.days[0].reading.kind).toBe("shift");
  });

  it("ignores a similar name the model returned by mistake", () => {
    const model = { ...fixture(), staff_names: ["Mengyu (PT)"] };
    model.target_rows = [{ ...model.target_rows[0], name_text: "Mengyu (PT)" }];
    expect(buildRoster(model, "Meng", TODAY)).toMatchObject({ ok: false, problem: "name_not_found" });
  });

  it("explains a cropped image where Meng's row is missing", () => {
    const model: ModelRoster = {
      ...fixture(),
      staff_names: ["Alex (FT)", "Priya (FT)"],
      target_rows: [],
      table_cut_off: true,
    };
    const result = buildRoster(model, "Meng", TODAY);
    expect(result).toMatchObject({ ok: false, problem: "name_not_found" });
    if (!result.ok) expect(result.hints.join(" ")).toMatch(/cropped/);
  });

  it("warns when Meng's row is cut off, and marks the days it can't see", () => {
    const model = withRow(fixture(), { row_fully_visible: false, cells: fixture().target_rows[0].cells.slice(0, 4) });
    model.table_cut_off = true;
    model.columns = model.columns.slice(0, 4);
    const result = okRoster(buildRoster(model, "Meng", TODAY));
    expect(result.warnings.join(" ")).toMatch(/row looks cut off/);
    expect(result.warnings.join(" ")).toMatch(/Only 4 of the 7 day columns/);
    expect(result.days[5].reading).toEqual({ kind: "missing" });
    expect(result.days[5].checks).toEqual(["This day isn't in the image for your row."]);
    expect(result.days[5].dateISO).toBe("2026-10-24");
  });

  it("rejects an image that isn't a roster", () => {
    expect(buildRoster({ ...fixture(), is_roster: false }, "Meng", TODAY)).toMatchObject({ ok: false, problem: "not_roster" });
  });

  it("says so when the name is in the list but its row wasn't read", () => {
    expect(buildRoster({ ...fixture(), target_rows: [] }, "Meng", TODAY)).toMatchObject({ ok: false, problem: "row_unreadable" });
  });
});

describe("dates", () => {
  it("parses DD-Mon-YY and other day-first forms", () => {
    expect(parseColumnDate("19-Oct-26")).toBe("2026-10-19");
    expect(parseColumnDate("Mon 19-Oct-26")).toBe("2026-10-19");
    expect(parseColumnDate("19 October 2026")).toBe("2026-10-19");
    expect(parseColumnDate("19/10/26")).toBe("2026-10-19");
    expect(parseColumnDate("31-Feb-26")).toBeNull();
    expect(parseColumnDate("Oct")).toBeNull();
  });

  it("reads the title's start", () => {
    expect(parseTitleStart("BANQUETS TEAM ROSTER 19/10 TO 25/10")).toEqual({ day: 19, month: 10 });
    expect(parseTitleStart("ROSTER")).toBeNull();
  });

  it("fills an unreadable date from the others and says so", () => {
    const model = fixture();
    model.columns[2] = { day: "WED", date_text: "2?-Oct-26" };
    const result = okRoster(buildRoster(model, "Meng", TODAY));
    expect(result.days[2].dateISO).toBe("2026-10-21");
    expect(result.warnings[0]).toMatch(/WED/);
  });

  it("flags a date that disagrees with the rest of the week", () => {
    const model = fixture();
    model.columns[3] = { day: "THU", date_text: "23-Oct-26" };
    const result = okRoster(buildRoster(model, "Meng", TODAY));
    expect(result.days[3].dateISO).toBe("2026-10-22");
    expect(result.warnings.join(" ")).toMatch(/THU reads "23-Oct-26"/);
  });

  it("falls back to the title when no column date is readable", () => {
    const model = { ...fixture(), columns: fixture().columns.map((column) => ({ ...column, date_text: null })) };
    const result = okRoster(buildRoster(model, "Meng", TODAY));
    expect(result.weekStart).toBe("2026-10-19");
    expect(result.warnings[0]).toMatch(/taken from the title/);
  });

  it("stops when there are no dates at all", () => {
    const model = { ...fixture(), roster_title: null, columns: [] };
    expect(buildRoster(model, "Meng", TODAY)).toMatchObject({ ok: false, problem: "no_dates" });
  });
});
