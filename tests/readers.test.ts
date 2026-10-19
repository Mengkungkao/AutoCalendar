import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelRosterSchema } from "@/lib/roster";
import { RosterReadError, availableProviders, resolveProvider, sniffImageType } from "@/server/read-roster";
import { readWithClaude } from "@/server/readers/claude";
import { readWithOpenAI } from "@/server/readers/openai";
import { fixture } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const IMAGE = { data: PNG, mediaType: "image/png" as const };

afterEach(() => vi.unstubAllEnvs());

describe("Claude reader", () => {
  function fakeClaude(reply: Partial<Anthropic.Beta.BetaMessage>) {
    const create = vi.fn(async () => ({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(fixture()) }],
      usage: { input_tokens: 1000, output_tokens: 500 },
      ...reply,
    }));
    return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
  }

  it("sends the image, the target name and the output schema", async () => {
    const { client, create } = fakeClaude({});
    expect(await readWithClaude(IMAGE, "Meng", client)).toEqual({ roster: fixture(), model: "claude-opus-5-5" });
    const [request] = create.mock.calls[0] as unknown as [Record<string, unknown> & { messages: { content: unknown[] }[] }];
    expect(request).toMatchObject({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    expect(request).not.toHaveProperty("thinking");
    expect(request.messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(PNG).toString("base64") } },
      { type: "text", text: 'Target name: "Meng"' },
    ]);
  });

  it("turns refusals, cut-off answers and bad JSON into readable errors", async () => {
    const cases: Partial<Anthropic.Beta.BetaMessage>[] = [
      { stop_reason: "refusal", content: [] },
      { stop_reason: "max_tokens", content: [{ type: "text", text: "{", citations: null }] },
      { content: [{ type: "text", text: "not json", citations: null }] },
      { content: [{ type: "text", text: JSON.stringify({ is_roster: true }), citations: null }] },
      { content: [] },
    ];
    for (const reply of cases) {
      const error = await readWithClaude(IMAGE, "Meng", fakeClaude(reply).client).catch((caught) => caught);
      expect(error).toBeInstanceOf(RosterReadError);
    }
  });
});

describe("OpenAI reader", () => {
  function fakeOpenAI(reply: Record<string, unknown>) {
    const create = vi.fn(async () => ({
      id: "resp_test",
      model: "gpt-6.1-sol",
      status: "completed",
      incomplete_details: null,
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(fixture()) }] }],
      output_text: JSON.stringify(fixture()),
      usage: { input_tokens: 1200, output_tokens: 600 },
      ...reply,
    }));
    return { client: { responses: { create } } as unknown as OpenAI, create };
  }

  it("sends the image as a data URL with strict structured output, and asks OpenAI not to store it", async () => {
    const { client, create } = fakeOpenAI({});
    expect(await readWithOpenAI(IMAGE, "Meng", client)).toEqual({ roster: fixture(), model: "gpt-6.1-sol" });
    const [request] = create.mock.calls[0] as unknown as [Record<string, unknown> & { input: { content: unknown[] }[] }];
    expect(request).toMatchObject({
      model: "gpt-6.1-sol",
      store: false,
      reasoning: { effort: "medium" },
      text: { format: { type: "json_schema", strict: true, name: "roster_transcription" } },
    });
    expect(request.instructions).toContain("transcribe photos and screenshots of a weekly staff roster");
    expect(request.input[0].content).toEqual([
      { type: "input_image", image_url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`, detail: "high" },
      { type: "input_text", text: 'Target name: "Meng"' },
    ]);
  });

  it("turns refusals, filtered or cut-off answers and bad JSON into readable errors", async () => {
    const cases: Record<string, unknown>[] = [
      { output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "no" }] }], output_text: "" },
      { status: "incomplete", incomplete_details: { reason: "content_filter" }, output_text: "" },
      { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "{" },
      { output_text: "not json" },
      { output_text: JSON.stringify({ is_roster: true }) },
      { output_text: "" },
    ];
    for (const reply of cases) {
      const error = await readWithOpenAI(IMAGE, "Meng", fakeOpenAI(reply).client).catch((caught) => caught);
      expect(error, JSON.stringify(reply)).toBeInstanceOf(RosterReadError);
    }
  });
});

describe("choosing the reading service", () => {
  const keys = (anthropic: string, openai: string, preferred = "") => {
    vi.stubEnv("ANTHROPIC_API_KEY", anthropic);
    vi.stubEnv("OPENAI_API_KEY", openai);
    vi.stubEnv("ROSTER_PROVIDER", preferred);
  };

  it("reports which services have keys", () => {
    keys("a", "");
    expect(availableProviders()).toEqual({ anthropic: true, openai: false });
  });

  it("automatic prefers ROSTER_PROVIDER, then Claude, then OpenAI", () => {
    keys("a", "o");
    expect(resolveProvider("auto")).toBe("anthropic");
    keys("a", "o", "openai");
    expect(resolveProvider("auto")).toBe("openai");
    keys("", "o");
    expect(resolveProvider("auto")).toBe("openai");
    keys("a", "", "openai");
    expect(resolveProvider("auto")).toBe("anthropic");
  });

  it("uses a chosen service only when it has a key, and never switches silently", () => {
    keys("a", "o");
    expect(resolveProvider("openai")).toBe("openai");
    keys("a", "");
    expect(() => resolveProvider("openai")).toThrow(/OPENAI_API_KEY/);
    keys("", "");
    expect(() => resolveProvider("auto")).toThrow(RosterReadError);
  });
});

describe("the output schemas sent to the APIs", () => {
  function expectStrict(schema: unknown) {
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.type === "object") {
        expect(record.additionalProperties).toBe(false);
        expect(new Set(record.required as string[])).toEqual(new Set(Object.keys(record.properties as object)));
      }
      for (const key of ["minimum", "maximum", "minLength", "maxLength", "pattern"]) expect(record).not.toHaveProperty(key);
      Object.values(record).forEach(visit);
    };
    visit(schema);
  }

  it("only use features structured outputs support (Claude)", () => {
    expectStrict(betaZodOutputFormat(modelRosterSchema).schema);
  });

  it("only use features strict structured outputs support (OpenAI)", () => {
    const format = zodTextFormat(modelRosterSchema, "roster_transcription");
    expect(format.strict).toBe(true);
    expectStrict(format.schema);
  });
});

describe("sniffImageType", () => {
  it("recognises formats by their bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    const heic = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0]);
    expect(sniffImageType(heic)).toBe("heic");
    expect(sniffImageType(new TextEncoder().encode("hello world!"))).toBeNull();
  });
});
