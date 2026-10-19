import { modelRosterSchema, type ModelRoster } from "@/lib/roster";

/**
 * What every roster reader (Claude, OpenAI) shares: the image it gets, the
 * instructions, the errors it may raise, and the check of its answer. Both
 * return the same transcription (modelRosterSchema), so everything after
 * reading is identical whichever service read the image.
 */

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export type RosterImage = { data: Uint8Array; mediaType: ImageType };

export class RosterReadError extends Error {
  constructor(
    readonly kind: "setup" | "busy" | "network" | "refused" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "RosterReadError";
  }
}

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export function effortFrom(value: string | undefined, fallback: Effort): Effort {
  return EFFORTS.find((level) => level === value) ?? fallback;
}

/** Per-request timeout; with one retry this stays inside the upload route's maxDuration. */
export const READ_TIMEOUT_MS = 75_000;
export const MAX_OUTPUT_TOKENS = 16_000;

export const SYSTEM_PROMPT = `You transcribe photos and screenshots of a weekly staff roster so that one person's shifts can be added to their calendar. Copy what is printed; don't interpret or correct it. A misread time puts a wrong shift in someone's calendar, so whenever a character could be something else, give a lower confidence and say what is uncertain in "doubt" instead of guessing.

How the roster is laid out:
- A title with the week's dates, e.g. "BANQUETS TEAM ROSTER 19/10 TO 25/10".
- Seven day columns, Monday to Sunday, each with its date underneath in DD-Mon-YY form, e.g. "19-Oct-26".
- Above the staff rows there may be a function block: event codes per day such as "195P DDPCT". These are not shifts; report them in function_codes.
- The first column lists staff names, sometimes followed by "(FT)" or "(PT)".
- Each staff row has one cell per day. A cell usually holds a 24-hour range such as "0730 - 1700"; an end above 2400 (e.g. "1600 - 2700") is normal and means the shift ends after midnight. A cell can also hold extra words (e.g. "Purchasing"), "OFF", or nothing, and some cells are filled solid red.

The user message gives a target name. target_rows must hold every row whose name equals the target once letter case and anything in brackets are ignored: target "Meng" matches "MENG (PT)" and "Meng(FT)", but not "Mengyu" or "Meng Li". If the target itself contains a bracket, the bracket must match too. If no row matches, return an empty list; never substitute a similar name.

For each matching row, give every day that is visible, reading straight across the row so each cell is attributed to the right day. Rows are thin and photos may be angled, so make sure you haven't drifted to the row above or below. Keep the text exactly as written (times as printed, "" for an empty cell). Set row_fully_visible to false if any part of the row is cut off or covered. Use confidence "high" only when every character is certain.`;

export const targetText = (targetName: string) => `Target name: ${JSON.stringify(targetName)}`;

/** Checks a reader's JSON answer against the transcription schema. */
export function parseTranscription(text: string | undefined, reader: string): ModelRoster {
  if (!text) throw new RosterReadError("failed", "The reading service returned no answer. Try again.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RosterReadError("failed", "The reading service's answer was cut short. Try again.");
  }
  const parsed = modelRosterSchema.safeParse(json);
  if (!parsed.success) {
    console.error(`${reader}: unexpected output shape`, parsed.error.issues.slice(0, 5));
    throw new RosterReadError("failed", "The reading service's answer didn't have the expected shape. Try again.");
  }
  return parsed.data;
}

export function logRead(fields: Record<string, unknown>): void {
  console.info(JSON.stringify({ event: "roster_read", ...fields }));
}
