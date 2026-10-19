import type { ModelRoster } from "@/lib/roster";
import type { Provider, ProviderChoice, ReaderInfo } from "@/lib/settings";
import { readWithClaude } from "./readers/claude";
import { readWithOpenAI } from "./readers/openai";
import { RosterReadError, type ImageType, type RosterImage } from "./readers/shared";

/**
 * Reads a roster image with the chosen service. Claude and OpenAI return the
 * same transcription, so the rest of the app doesn't care which one read it.
 * The image is held in memory for the request only; nothing is written to
 * disk or logged except timings and token counts.
 */

export { RosterReadError, type ImageType, type RosterImage };

export type Reader = ReaderInfo;

const KEY_NAMES: Record<Provider, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" };
const SERVICE_NAMES: Record<Provider, string> = { anthropic: "Claude", openai: "OpenAI" };

/** Which services this server has an API key for. */
export function availableProviders(): Record<Provider, boolean> {
  return { anthropic: Boolean(process.env.ANTHROPIC_API_KEY), openai: Boolean(process.env.OPENAI_API_KEY) };
}

/**
 * "auto" uses ROSTER_PROVIDER when that service has a key, otherwise Claude,
 * otherwise OpenAI. A specific choice without a key is an error, not a switch.
 */
export function resolveProvider(choice: ProviderChoice): Provider {
  const keys = availableProviders();
  if (choice !== "auto") {
    if (keys[choice]) return choice;
    throw new RosterReadError(
      "setup",
      `${SERVICE_NAMES[choice]} isn't set up on this server (no ${KEY_NAMES[choice]}). Add the key, or pick another reading service in Settings.`,
    );
  }
  const preferred = process.env.ROSTER_PROVIDER;
  if ((preferred === "anthropic" || preferred === "openai") && keys[preferred]) return preferred;
  if (keys.anthropic) return "anthropic";
  if (keys.openai) return "openai";
  throw new RosterReadError("setup", "The server has no API key: set ANTHROPIC_API_KEY or OPENAI_API_KEY (see the README).");
}

export async function readRosterImage(
  image: RosterImage,
  targetName: string,
  choice: ProviderChoice = "auto",
): Promise<{ roster: ModelRoster; reader: Reader }> {
  const provider = resolveProvider(choice);
  const { roster, model } =
    provider === "openai" ? await readWithOpenAI(image, targetName) : await readWithClaude(image, targetName);
  return { roster, reader: { provider, model } };
}

/** Identifies the image format from its first bytes; the browser's label is not trusted. */
export function sniffImageType(bytes: Uint8Array): ImageType | "heic" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return "heic";
  return null;
}
