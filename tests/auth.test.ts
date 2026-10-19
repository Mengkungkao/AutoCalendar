import { describe, expect, it } from "vitest";
import { SESSION_DAYS, createSessionToken, passwordMatches, verifySessionToken } from "@/server/auth";

describe("session tokens", () => {
  it("accepts its own token", async () => {
    const token = await createSessionToken("correct horse");
    expect(await verifySessionToken(token, "correct horse")).toBe(true);
  });

  it("signs everyone out when the password changes", async () => {
    const token = await createSessionToken("correct horse");
    expect(await verifySessionToken(token, "battery staple")).toBe(false);
  });

  it("expires", async () => {
    const now = Date.parse("2026-10-19T00:00:00Z");
    const token = await createSessionToken("pw", now);
    expect(await verifySessionToken(token, "pw", now + (SESSION_DAYS - 1) * 86_400_000)).toBe(true);
    expect(await verifySessionToken(token, "pw", now + (SESSION_DAYS + 1) * 86_400_000)).toBe(false);
  });

  it("rejects tampered or malformed tokens", async () => {
    const token = await createSessionToken("pw");
    const [expires, signature] = token.split(".");
    expect(await verifySessionToken(`${Number(expires) + 86_400}.${signature}`, "pw")).toBe(false);
    expect(await verifySessionToken(`${expires}.${signature.slice(1)}A`, "pw")).toBe(false);
    for (const bad of [undefined, "", "abc", "1.2.3", `${expires}.`, `${expires}.!!!`]) {
      expect(await verifySessionToken(bad, "pw")).toBe(false);
    }
  });

  it("refuses everything when no password is configured", async () => {
    const token = await createSessionToken("pw");
    expect(await verifySessionToken(token, null)).toBe(false);
    expect(await passwordMatches("", null)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it("compares exactly", async () => {
    expect(await passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(await passwordMatches("correct horse ", "correct horse")).toBe(false);
    expect(await passwordMatches("Correct horse", "correct horse")).toBe(false);
  });
});
