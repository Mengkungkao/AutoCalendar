import { NextResponse, type NextRequest } from "next/server";
import { buildRoster } from "@/lib/roster";
import { DEFAULT_SETTINGS, PROVIDER_CHOICES, type ProviderChoice } from "@/lib/settings";
import { todayInZone } from "@/lib/time";
import { MAX_FILE_BYTES, formatMegabytes } from "@/lib/upload";
import { isSignedIn } from "@/server/auth";
import { UnreadableImageError, normalizeImage } from "@/server/normalize-image";
import { RosterReadError, readRosterImage, sniffImageType } from "@/server/read-roster";

// Reads one roster image. The image lives only in this request's memory: it
// is prepared, passed to the chosen reader (Claude or OpenAI) and dropped;
// nothing is saved or logged.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 160;

const fail = (status: number, error: string, kind = "failed") =>
  NextResponse.json({ error, kind }, { status, headers: { "Cache-Control": "no-store" } });

function today(timeZone: FormDataEntryValue | null | undefined): string {
  try {
    return todayInZone(Date.now(), typeof timeZone === "string" && timeZone ? timeZone : DEFAULT_SETTINGS.timeZone);
  } catch {
    return todayInZone(Date.now(), DEFAULT_SETTINGS.timeZone);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isSignedIn(request.cookies))) return fail(401, "Sign in again.", "auth");

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  const name = form?.get("name");
  const providerField = form?.get("provider");
  if (!(image instanceof Blob) || image.size === 0) return fail(400, "No image was uploaded.");
  if (image.size > MAX_FILE_BYTES) {
    return fail(413, `That image is ${formatMegabytes(image.size)}; the limit is ${formatMegabytes(MAX_FILE_BYTES)}.`);
  }
  if (typeof name !== "string" || !name.trim() || name.length > 60) return fail(400, "Set the name to match in Settings.");
  const provider: ProviderChoice = PROVIDER_CHOICES.find((choice) => choice === providerField) ?? "auto";

  const data = new Uint8Array(await image.arrayBuffer());
  const type = sniffImageType(data);
  if (type === "heic") {
    return fail(415, "This browser couldn't convert the HEIC photo. Take a screenshot of it and upload that instead.");
  }
  if (!type) return fail(415, "That file isn't a PNG, JPG or HEIC image.");

  try {
    const prepared = await normalizeImage(data);
    const { roster, reader } = await readRosterImage(prepared, name.trim(), provider);
    return NextResponse.json(
      { ...buildRoster(roster, name.trim(), today(form?.get("timeZone"))), reader },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof UnreadableImageError) return fail(415, error.message);
    if (error instanceof RosterReadError) {
      const status = error.kind === "busy" ? 503 : error.kind === "setup" ? 500 : 502;
      return fail(status, error.message, error.kind);
    }
    console.error("extract: unexpected error", error);
    return fail(500, "Something went wrong while reading the roster. Try again.");
  }
}
