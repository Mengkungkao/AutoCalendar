import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayEntries, toDraft } from "@/lib/days";
import { planShift } from "@/lib/plan";
import { buildRoster, type ModelRoster, type RosterResult } from "@/lib/roster";
import { DEFAULT_SETTINGS, type Provider } from "@/lib/settings";
import { MAX_FILE_BYTES } from "@/lib/upload";

/**
 * Live tests: real images through the real APIs (a few cents each), once for
 * each service with a key in .env.local (ANTHROPIC_API_KEY, OPENAI_API_KEY).
 * Images go through the same preparation as on the website. Your own roster
 * goes in fixtures/ as roster-19-oct.png or .jpg (see fixtures/README.md);
 * the synthetic images come from scripts/make-test-rosters.py.
 *
 *   npm run test:live
 */

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { availableProviders, readRosterImage, sniffImageType } = await import("@/server/read-roster");
const { normalizeImage } = await import("@/server/normalize-image");

const TODAY = "2026-10-19";
const OUTPUT = "tests/live/output";

const EXPECTED = [
  { day: "Mon 19 Oct", shift: "7:30 AM – 5:00 PM", travel: "7:00 – 7:30 AM", reminder1: "6:30 AM", reminder2: "6:45 AM" },
  { day: "Tue 20 Oct", shift: "6:30 AM – 4:00 PM", travel: "6:00 – 6:30 AM", reminder1: "5:30 AM", reminder2: "5:45 AM" },
  { day: "Wed 21 Oct", shift: "6:15 AM – 4:00 PM", travel: "5:45 – 6:15 AM", reminder1: "5:15 AM", reminder2: "5:30 AM" },
  { day: "Thu 22 Oct", shift: "8:00 AM – 6:00 PM", travel: "7:30 – 8:00 AM", reminder1: "7:00 AM", reminder2: "7:15 AM" },
  { day: "Sat 24 Oct", shift: "4:00 PM – 3:00 AM Sun", travel: "3:30 – 4:00 PM", reminder1: "3:00 PM", reminder2: "3:15 PM" },
];

async function read(provider: Provider, path: string, name = "Meng"): Promise<{ model: ModelRoster; result: RosterResult }> {
  const data = new Uint8Array(readFileSync(path));
  const type = sniffImageType(data);
  if (!type || type === "heic") throw new Error(`${path}: use a PNG or JPG (got ${type ?? "unknown"})`);
  if (data.length > MAX_FILE_BYTES) throw new Error(`${path} is over the 10 MB limit`);
  const { roster, reader } = await readRosterImage(await normalizeImage(data), name, provider);
  const result = buildRoster(roster, name, TODAY);
  mkdirSync(OUTPUT, { recursive: true });
  const base = path.split("/").pop();
  writeFileSync(`${OUTPUT}/${provider}-${base}.json`, JSON.stringify({ reader, model: roster, result }, null, 2));
  return { model: roster, result };
}

function table(result: RosterResult) {
  if (!result.ok) throw new Error(`${result.problem}: ${result.message} ${result.hints.join(" ")}`);
  return dayEntries(result)
    .flatMap((day) => day.shifts)
    .map((shift) => planShift(toDraft(shift), DEFAULT_SETTINGS))
    .map((plan) => ({
      day: plan.dayLabel,
      shift: plan.display.shift,
      travel: plan.display.travel,
      reminder1: plan.display.reminders[0]?.time,
      reminder2: plan.display.reminders[1]?.time,
    }));
}

const uids = (result: RosterResult) =>
  result.ok
    ? dayEntries(result)
        .flatMap((day) => day.shifts.map((shift) => planShift(toDraft(shift), DEFAULT_SETTINGS)))
        .flatMap((plan) => [plan.shift.uid, plan.travel.uid])
    : [];

const realRoster = ["fixtures/roster-19-oct.png", "fixtures/roster-19-oct.jpg", "fixtures/roster-19-oct.jpeg"].find(existsSync);
const images = "tests/live/images";
const keys = availableProviders();
const providers = (["anthropic", "openai"] as const).filter((provider) => keys[provider]);

describe.skipIf(providers.length === 0).each(providers)("live: %s reads roster images", (provider) => {
  it.skipIf(!realRoster)("your real roster gives exactly the expected table", async () => {
    const { result } = await read(provider, realRoster!);
    expect(table(result)).toEqual(EXPECTED);
    if (result.ok) {
      expect(result.days[4].reading.kind).not.toBe("shift");
      expect(result.days[6].reading.kind).not.toBe("shift");
      console.log(`${provider} real roster warnings:`, result.warnings, "checks:", result.days.flatMap((day) => day.checks));
    }
  });

  it.skipIf(!realRoster)("the same real roster read twice gives identical event IDs", async () => {
    const first = await read(provider, realRoster!);
    const second = await read(provider, realRoster!);
    expect(uids(second.result)).toEqual(uids(first.result));
    expect(uids(first.result)).toHaveLength(10);
  });

  it("synthetic screenshot gives the expected table (OFF, red cell, 2700)", async () => {
    const { result } = await read(provider, `${images}/synthetic-roster.png`);
    expect(table(result)).toEqual(EXPECTED);
    if (result.ok) {
      expect(result.days[4].reading).toEqual({ kind: "off", reason: "off" });
      expect(result.days[6].reading).toEqual({ kind: "off", reason: "red" });
      expect(result.days[0].functions).toBe("195P DDPCT");
    }
  });

  it("blurry, slightly angled photo still gives the expected table", async () => {
    const { result } = await read(provider, `${images}/synthetic-photo.jpg`);
    expect(table(result)).toEqual(EXPECTED);
  });

  it("cropped image without Meng's row says the name is missing", async () => {
    const { result } = await read(provider, `${images}/synthetic-cropped.png`);
    expect(result).toMatchObject({ ok: false, problem: "name_not_found" });
  });

  it("a blank cell gives nothing and extra words become a note", async () => {
    const { result } = await read(provider, `${images}/synthetic-notes.png`);
    expect(table(result).map((row) => row.day)).toEqual(["Mon 19 Oct", "Tue 20 Oct", "Thu 22 Oct", "Sat 24 Oct"]);
    if (result.ok) {
      expect(result.days[2].reading).toEqual({ kind: "off", reason: "blank" });
      expect(result.days[3].reading).toMatchObject({ kind: "shift", note: "Purchasing" });
    }
  });

  it("two rows called Meng are refused, not guessed", async () => {
    const { result } = await read(provider, `${images}/synthetic-two-mengs.png`);
    expect(result).toMatchObject({ ok: false, problem: "name_ambiguous" });
  });

  it("the same synthetic roster read twice gives identical event IDs", async () => {
    const first = await read(provider, `${images}/synthetic-roster.png`);
    const second = await read(provider, `${images}/synthetic-roster.png`);
    expect(uids(second.result)).toEqual(uids(first.result));
  });
});
