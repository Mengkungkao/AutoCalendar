import { describe, expect, it } from "vitest";
import { nameMatches, normalizeName, similarNames } from "@/lib/names";

describe("name matching", () => {
  it("ignores case and anything in brackets", () => {
    expect(nameMatches("Meng (PT)", "Meng")).toBe(true);
    expect(nameMatches("MENG(FT)", "meng")).toBe(true);
    expect(nameMatches("  meng  ", "Meng")).toBe(true);
    expect(nameMatches("Meng [casual]", "Meng")).toBe(true);
    expect(nameMatches("Meng (PT", "Meng")).toBe(true);
  });

  it("does not match other names that contain it", () => {
    expect(nameMatches("Mengyu (PT)", "Meng")).toBe(false);
    expect(nameMatches("Meng Li", "Meng")).toBe(false);
    expect(nameMatches("Ameng", "Meng")).toBe(false);
  });

  it("requires the bracket when the target has one", () => {
    expect(nameMatches("Meng (PT)", "Meng (PT)")).toBe(true);
    expect(nameMatches("MENG(pt)", "Meng (PT)")).toBe(true);
    expect(nameMatches("Meng (FT)", "Meng (PT)")).toBe(false);
  });

  it("never matches an empty target", () => {
    expect(nameMatches("", "")).toBe(false);
    expect(nameMatches("(PT)", "")).toBe(false);
  });

  it("normalises names", () => {
    expect(normalizeName(" Meng  (PT) ")).toBe("meng");
    expect(normalizeName("O'Brien*")).toBe("o'brien");
  });

  it("suggests near misses without treating them as matches", () => {
    expect(similarNames(["Meng Li (FT)", "Mengyu", "Mang", "Alex", "Meng (PT)"], "Meng")).toEqual(["Meng Li (FT)", "Mengyu", "Mang"]);
    expect(similarNames(["Meng (FT)"], "Meng (PT)")).toEqual(["Meng (FT)"]);
  });
});
