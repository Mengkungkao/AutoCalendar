import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { modelRosterSchema, type ModelRoster } from "@/lib/roster";
import {
  MAX_OUTPUT_TOKENS,
  READ_TIMEOUT_MS,
  RosterReadError,
  SYSTEM_PROMPT,
  effortFrom,
  logRead,
  parseTranscription,
  targetText,
  type RosterImage,
} from "./shared";

/** Reads a roster image with Claude (Anthropic API). Needs ANTHROPIC_API_KEY. */

export const CLAUDE_MODEL = process.env.ROSTER_CLAUDE_MODEL || "claude-opus-5-5";
const CLAUDE_EFFORT = effortFrom(process.env.ROSTER_CLAUDE_EFFORT, "medium");

let sharedClient: Anthropic | null = null;
function defaultClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new RosterReadError("setup", "The server has no ANTHROPIC_API_KEY, so Claude can't read images. See the README.");
  }
  sharedClient ??= new Anthropic({ timeout: READ_TIMEOUT_MS, maxRetries: 1 });
  return sharedClient;
}

export async function readWithClaude(
  image: RosterImage,
  targetName: string,
  client?: Anthropic,
): Promise<{ roster: ModelRoster; model: string }> {
  const api = client ?? defaultClient();
  const started = Date.now();
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await api.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: CLAUDE_EFFORT, format: betaZodOutputFormat(modelRosterSchema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: Buffer.from(image.data).toString("base64") },
            },
            { type: "text", text: targetText(targetName) },
          ],
        },
      ],
    });
  } catch (error) {
    throw toReadError(error);
  }

  logRead({
    provider: "anthropic",
    model: response.model,
    ms: Date.now() - started,
    stop_reason: response.stop_reason,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });

  if (response.stop_reason === "refusal") {
    throw new RosterReadError("refused", "Claude declined this image. Try a screenshot of just the roster.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new RosterReadError("failed", "The roster was too long to read in one go. Try a screenshot of just this week's table.");
  }
  const text = response.content.find((block) => block.type === "text")?.text;
  return { roster: parseTranscription(text, "claude"), model: response.model };
}

function toReadError(error: unknown): RosterReadError {
  if (error instanceof RosterReadError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("claude: API key rejected", error.status);
    return new RosterReadError("setup", "The server's Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new RosterReadError("busy", "Too many requests to Claude right now. Wait a minute and try again.");
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new RosterReadError("network", "Reading the roster took too long. Try again.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new RosterReadError("network", "The server couldn't reach Claude. Try again.");
  }
  if (error instanceof Anthropic.InternalServerError || (error instanceof Anthropic.APIError && error.status === 529)) {
    return new RosterReadError("busy", "Claude is busy. Try again in a minute.");
  }
  if (error instanceof Anthropic.APIError) {
    console.error("claude: API error", error.status, error.message);
    if (error.status === 400 && /credit|billing/i.test(error.message)) {
      return new RosterReadError("setup", "The Anthropic account has no credit left. Add credit in the Anthropic Console.");
    }
    return new RosterReadError("failed", `Claude returned an error (${error.status ?? "unknown"}). Try again.`);
  }
  console.error("claude: unexpected error", error);
  return new RosterReadError("failed", "Something went wrong while reading the roster. Try again.");
}
