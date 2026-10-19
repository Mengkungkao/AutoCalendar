import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
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

/**
 * Reads a roster image with OpenAI (Responses API, structured outputs).
 * Needs OPENAI_API_KEY. `store: false` stops OpenAI keeping the request and
 * image as a stored response.
 */

// OpenAI's "near-flagship at lower cost" model (Oct 2026); set ROSTER_OPENAI_MODEL=gpt-6-astra for the flagship.
export const OPENAI_MODEL = process.env.ROSTER_OPENAI_MODEL || "gpt-6.1-sol";
const OPENAI_EFFORT = effortFrom(process.env.ROSTER_OPENAI_EFFORT, "medium");

let sharedClient: OpenAI | null = null;
function defaultClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new RosterReadError("setup", "The server has no OPENAI_API_KEY, so OpenAI can't read images. See the README.");
  }
  sharedClient ??= new OpenAI({ timeout: READ_TIMEOUT_MS, maxRetries: 1 });
  return sharedClient;
}

export async function readWithOpenAI(
  image: RosterImage,
  targetName: string,
  client?: OpenAI,
): Promise<{ roster: ModelRoster; model: string }> {
  const api = client ?? defaultClient();
  const started = Date.now();
  let response: OpenAI.Responses.Response;
  try {
    response = await api.responses.create({
      model: OPENAI_MODEL,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: `data:${image.mediaType};base64,${Buffer.from(image.data).toString("base64")}`,
              detail: "high",
            },
            { type: "input_text", text: targetText(targetName) },
          ],
        },
      ],
      reasoning: { effort: OPENAI_EFFORT },
      text: { format: zodTextFormat(modelRosterSchema, "roster_transcription") },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    });
  } catch (error) {
    throw toReadError(error);
  }

  logRead({
    provider: "openai",
    model: response.model,
    ms: Date.now() - started,
    status: response.status,
    input_tokens: response.usage?.input_tokens,
    output_tokens: response.usage?.output_tokens,
  });

  const refused = response.output.some(
    (item) => item.type === "message" && item.content.some((part) => part.type === "refusal"),
  );
  if (refused || response.incomplete_details?.reason === "content_filter") {
    throw new RosterReadError("refused", "OpenAI declined this image. Try a screenshot of just the roster.");
  }
  if (response.status === "incomplete") {
    throw new RosterReadError("failed", "The roster was too long to read in one go. Try a screenshot of just this week's table.");
  }
  return { roster: parseTranscription(response.output_text, "openai"), model: response.model };
}

function toReadError(error: unknown): RosterReadError {
  if (error instanceof RosterReadError) return error;
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
    console.error("openai: API key rejected", error.status);
    return new RosterReadError("setup", "The server's OpenAI API key was rejected. Check OPENAI_API_KEY.");
  }
  if (error instanceof OpenAI.RateLimitError) {
    if (error.code === "insufficient_quota") {
      return new RosterReadError("setup", "The OpenAI account has no credit left. Add credit in the OpenAI dashboard.");
    }
    return new RosterReadError("busy", "Too many requests to OpenAI right now. Wait a minute and try again.");
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new RosterReadError("network", "Reading the roster took too long. Try again.");
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new RosterReadError("network", "The server couldn't reach OpenAI. Try again.");
  }
  if (error instanceof OpenAI.InternalServerError) {
    return new RosterReadError("busy", "OpenAI is busy. Try again in a minute.");
  }
  if (error instanceof OpenAI.APIError) {
    console.error("openai: API error", error.status, error.message);
    return new RosterReadError("failed", `OpenAI returned an error (${error.status ?? "unknown"}). Try again.`);
  }
  console.error("openai: unexpected error", error);
  return new RosterReadError("failed", "Something went wrong while reading the roster. Try again.");
}
