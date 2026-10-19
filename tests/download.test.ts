import { describe, expect, it } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "@/lib/base64url";
import { downloadHref, readDownload } from "@/lib/download";
import { DEFAULT_SETTINGS, settingsFromUnknown } from "@/lib/settings";

const shift = { dateISO: "2026-10-24", slot: 0, start: 960, end: 1620, note: "Purchasing – “VIP”", functions: "220P WEDDING" };

describe("download links", () => {
  it("round-trip the shifts and settings", () => {
    const href = downloadHref("shift-sat-24-oct.ics", { ...DEFAULT_SETTINGS, venueAddress: "Café St" }, [shift]);
    expect(href.startsWith("/api/ics/shift-sat-24-oct.ics?d=")).toBe(true);
    const payload = readDownload(new URL(href, "http://x").searchParams.get("d"));
    expect(payload).toEqual({ v: 1, settings: { ...DEFAULT_SETTINGS, venueAddress: "Café St" }, shifts: [shift] });
  });

  it("stay short enough for a URL with a whole week", () => {
    const week = Array.from({ length: 7 }, (_, index) => ({ ...shift, dateISO: `2026-10-${19 + index}` }));
    expect(downloadHref("week.ics", DEFAULT_SETTINGS, week).length).toBeLessThan(4000);
  });

  it("reject broken or invalid payloads", () => {
    expect(readDownload(null)).toBeNull();
    expect(readDownload("not base64!")).toBeNull();
    expect(readDownload(encodeBase64Url("{"))).toBeNull();
    expect(readDownload(encodeBase64Url(JSON.stringify({ v: 1, settings: DEFAULT_SETTINGS, shifts: [] })))).toBeNull();
    const backwards = { ...shift, start: 1000, end: 900 };
    expect(readDownload(encodeBase64Url(JSON.stringify({ v: 1, settings: DEFAULT_SETTINGS, shifts: [backwards] })))).toBeNull();
    const badZone = { ...DEFAULT_SETTINGS, timeZone: "Nowhere/Land" };
    expect(readDownload(encodeBase64Url(JSON.stringify({ v: 1, settings: badZone, shifts: [shift] })))).toBeNull();
  });

  it("encode UTF-8 safely", () => {
    const text = "Zoë – 夜勤 ✓";
    expect(decodeBase64Url(encodeBase64Url(text))).toBe(text);
  });
});

describe("settingsFromUnknown", () => {
  it("fills in missing fields and falls back on bad ones", () => {
    expect(settingsFromUnknown({ name: "Alex" })).toEqual({ ...DEFAULT_SETTINGS, name: "Alex" });
    expect(settingsFromUnknown({ travelMinutes: -5 })).toEqual(DEFAULT_SETTINGS);
    expect(settingsFromUnknown("nonsense")).toEqual(DEFAULT_SETTINGS);
  });
});
