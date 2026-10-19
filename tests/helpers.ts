import { readFileSync } from "node:fs";
import { dayEntries, toDraft } from "@/lib/days";
import { planShift } from "@/lib/plan";
import { buildRoster, modelRosterSchema, type ModelRoster, type RosterResult } from "@/lib/roster";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";

/** A simulated model reply for the 19–25 Oct 2026 roster (Meng's row as in the expected table). */
export function fixture(): ModelRoster {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/model-19-oct.json", import.meta.url), "utf8"));
  return modelRosterSchema.parse(raw);
}

export function okRoster(result: RosterResult) {
  if (!result.ok) throw new Error(`Expected a roster, got ${result.problem}: ${result.message}`);
  return result;
}

export const TODAY = "2026-10-19";

/** The roster's shifts planned with the given settings, in day order. */
export function plannedWeek(model: ModelRoster = fixture(), settings: Settings = DEFAULT_SETTINGS) {
  const roster = okRoster(buildRoster(model, settings.name, TODAY));
  return dayEntries(roster).flatMap((day) => day.shifts.map((shift) => planShift(toDraft(shift), settings)));
}

/** The table a person would check on their phone: one row per shift. */
export function previewTable(model?: ModelRoster, settings?: Settings) {
  return plannedWeek(model, settings).map((plan) => ({
    day: plan.dayLabel,
    shift: plan.display.shift,
    travel: plan.display.travel,
    reminder1: plan.display.reminders[0]?.time,
    reminder2: plan.display.reminders[1]?.time,
  }));
}
