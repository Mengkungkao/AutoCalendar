import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as extract } from "@/app/api/extract/route";
import { GET as ics } from "@/app/api/ics/[file]/route";
import { POST as login } from "@/app/api/login/route";
import { POST as saveSettings } from "@/app/api/settings/route";
import { downloadHref } from "@/lib/download";
import { DEFAULT_SETTINGS, SETTINGS_COOKIE } from "@/lib/settings";
import { proxy } from "@/proxy";
import { SESSION_COOKIE, createSessionToken } from "@/server/auth";
import { RosterReadError, readRosterImage } from "@/server/read-roster";
import { readSettingsCookie } from "@/server/settings-cookie";
import { fixture } from "./helpers";

vi.mock("@/server/read-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/read-roster")>();
  return { ...actual, readRosterImage: vi.fn() };
});

const PASSWORD = "test-password-123";
const PNG = new Uint8Array(readFileSync("tests/live/images/synthetic-roster.png"));
const READER = { provider: "anthropic" as const, model: "claude-opus-5-5" };
const reads = (roster = fixture()) => ({ roster, reader: READER });

/** A real JPEG between Vercel's 4.5 MB request limit and our 10 MB limit. */
let BIG_PHOTO: Uint8Array;
/** Over the 10 MB limit (the bytes don't need to be an image to be refused). */
const TOO_BIG = new Uint8Array(12 * 1024 * 1024);
beforeAll(async () => {
  const width = 4032;
  const height = 3024;
  const pixels = Buffer.alloc(width * height * 3);
  let state = 88172645;
  for (let index = 0; index < pixels.length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[index] = state & 255;
  }
  BIG_PHOTO = new Uint8Array(await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 75 }).toBuffer());
});
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0]);

let sessionCookie = "";
beforeEach(async () => {
  vi.stubEnv("APP_PASSWORD", PASSWORD);
  sessionCookie = `${SESSION_COOKIE}=${await createSessionToken(PASSWORD)}`;
  vi.mocked(readRosterImage).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

function upload(bytes: Uint8Array, { name = "Meng", cookie = sessionCookie, provider = "" } = {}) {
  const form = new FormData();
  form.append("image", new Blob([bytes as Uint8Array<ArrayBuffer>]), "roster.png");
  form.append("name", name);
  if (provider) form.append("provider", provider);
  form.append("timeZone", "Australia/Melbourne");
  return new NextRequest("http://localhost/api/extract", { method: "POST", body: form, headers: { cookie } });
}

describe("POST /api/extract", () => {
  it("needs the sign-in cookie", async () => {
    const response = await extract(upload(PNG, { cookie: "" }));
    expect(response.status).toBe(401);
    expect(readRosterImage).not.toHaveBeenCalled();
  });

  it("reads the image and returns Meng's week and who read it", async () => {
    vi.mocked(readRosterImage).mockResolvedValue(reads());
    const response = await extract(upload(PNG, { name: "  Meng " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, matchedName: "Meng (PT)", weekStart: "2026-10-19", reader: READER });
    expect(body.days).toHaveLength(7);
    const [image, name, provider] = vi.mocked(readRosterImage).mock.calls[0];
    expect(name).toBe("Meng");
    expect(provider).toBe("auto");
    expect(image).toEqual({ data: PNG, mediaType: "image/png" });
  });

  it("passes the chosen reading service on, and ignores unknown ones", async () => {
    vi.mocked(readRosterImage).mockResolvedValue(reads());
    await extract(upload(PNG, { provider: "openai" }));
    await extract(upload(PNG, { provider: "something-else" }));
    expect(vi.mocked(readRosterImage).mock.calls.map((call) => call[2])).toEqual(["openai", "auto"]);
  });

  it("accepts a photo up to 10 MB and shrinks it for the reader", async () => {
    vi.mocked(readRosterImage).mockResolvedValue(reads());
    expect(BIG_PHOTO.length).toBeGreaterThan(4_500_000);
    expect(BIG_PHOTO.length).toBeLessThan(10 * 1024 * 1024);
    const response = await extract(upload(BIG_PHOTO));
    expect(response.status).toBe(200);
    const [image] = vi.mocked(readRosterImage).mock.calls[0];
    expect(image.mediaType).toBe("image/jpeg");
    expect(image.data.length).toBeLessThanOrEqual(3_750_000);
  });

  it("refuses files over 10 MB without reading them", async () => {
    const response = await extract(upload(TOO_BIG));
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe("That image is 12 MB; the limit is 10 MB.");
    expect(readRosterImage).not.toHaveBeenCalled();
  });

  it("says when the chosen service has no key", async () => {
    vi.mocked(readRosterImage).mockRejectedValue(new RosterReadError("setup", "OpenAI isn't set up on this server (no OPENAI_API_KEY)."));
    const response = await extract(upload(PNG, { provider: "openai" }));
    expect(response.status).toBe(500);
    expect((await response.json()).kind).toBe("setup");
  });

  it("gives the same answer for the same roster uploaded twice", async () => {
    vi.mocked(readRosterImage).mockResolvedValue(reads());
    const first = await (await extract(upload(PNG))).json();
    const second = await (await extract(upload(PNG))).json();
    expect(second).toEqual(first);
  });

  it("reports a missing name as a clear problem, not an error", async () => {
    vi.mocked(readRosterImage).mockResolvedValue(reads({ ...fixture(), staff_names: ["Alex"], target_rows: [] }));
    const body = await (await extract(upload(PNG))).json();
    expect(body).toMatchObject({ ok: false, problem: "name_not_found" });
  });

  it("rejects files that aren't images, and HEIC the browser didn't convert", async () => {
    expect((await extract(upload(new TextEncoder().encode("plain text file")))).status).toBe(415);
    const heic = await extract(upload(HEIC));
    expect(heic.status).toBe(415);
    expect((await heic.json()).error).toMatch(/HEIC/);
    expect(readRosterImage).not.toHaveBeenCalled();
  });

  it("passes on the reader's errors", async () => {
    vi.mocked(readRosterImage).mockRejectedValue(new RosterReadError("busy", "The reading service is busy. Try again in a minute."));
    const response = await extract(upload(PNG));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The reading service is busy. Try again in a minute.", kind: "busy" });
  });
});

describe("GET /api/ics/[file]", () => {
  const shift = { dateISO: "2026-10-19", slot: 0, start: 450, end: 1020, note: null, functions: null };
  const request = (href: string, cookie = sessionCookie) => new NextRequest(`http://localhost${href}`, { headers: { cookie } });
  const params = (file: string) => ({ params: Promise.resolve({ file }) });

  it("returns a calendar file for the shift", async () => {
    const response = await ics(request(downloadHref("shift-mon-19-oct.ics", DEFAULT_SETTINGS, [shift])), params("shift-mon-19-oct.ics"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="shift-mon-19-oct.ics"');
    const text = await response.text();
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(text).toContain("UID:meng-2026-10-19-travel@autocalendar");
  });

  it("needs the sign-in cookie and a valid link", async () => {
    const href = downloadHref("x.ics", DEFAULT_SETTINGS, [shift]);
    expect((await ics(request(href, ""), params("x.ics"))).status).toBe(401);
    expect((await ics(request("/api/ics/x.ics?d=broken"), params("x.ics"))).status).toBe(400);
  });

  it("never echoes an unsafe file name", async () => {
    const response = await ics(request(downloadHref("x.ics", DEFAULT_SETTINGS, [shift])), params('a"b.ics'));
    expect(response.headers.get("content-disposition")).toBe('inline; filename="shifts.ics"');
  });
});

describe("sign-in", () => {
  const attempt = (password: string) =>
    login(new NextRequest("http://localhost/api/login", { method: "POST", body: JSON.stringify({ password }), headers: { "content-type": "application/json" } }));

  it("sets an httpOnly session cookie for the right password", async () => {
    const response = await attempt(PASSWORD);
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("refuses a wrong password", async () => {
    const response = await attempt("guess");
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("stays locked when APP_PASSWORD isn't set", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect((await attempt("")).status).toBe(503);
  });

  it("sends visitors without a session to /login", async () => {
    const out = await proxy(new NextRequest("http://localhost/"));
    expect(out.status).toBe(307);
    expect(out.headers.get("location")).toBe("http://localhost/login");
    const signedIn = await proxy(new NextRequest("http://localhost/", { headers: { cookie: sessionCookie } }));
    expect(signedIn.headers.get("location")).toBeNull();
  });
});

describe("POST /api/settings", () => {
  const post = (body: unknown, cookie = sessionCookie) =>
    saveSettings(new NextRequest("http://localhost/api/settings", { method: "POST", body: JSON.stringify(body), headers: { cookie } }));

  it("saves valid settings in a cookie the server can read back", async () => {
    const settings = { ...DEFAULT_SETTINGS, name: "Alex", travelMinutes: 40 };
    const response = await post(settings);
    expect(response.status).toBe(200);
    const value = /ac_settings=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];
    expect(readSettingsCookie({ get: (name) => (name === SETTINGS_COOKIE && value ? { value } : undefined) })).toEqual(settings);
  });

  it("rejects invalid settings and anonymous requests", async () => {
    expect((await post({ ...DEFAULT_SETTINGS, travelMinutes: 2 })).status).toBe(400);
    expect((await post(DEFAULT_SETTINGS, "")).status).toBe(401);
  });
});
