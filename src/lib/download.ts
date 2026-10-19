import { z } from "zod";
import { decodeBase64Url, encodeBase64Url } from "./base64url";
import { shiftDraftSchema, type ShiftDraft } from "./plan";
import { settingsSchema, type Settings } from "./settings";

/**
 * A download link carries the confirmed shifts and the settings they were
 * previewed with, so the server can write the file without storing anything.
 * The link is a plain GET: iPhone Safari opens text/calendar responses in its
 * calendar sheet, which a script-made file (blob) download does not do.
 */

export const downloadSchema = z.object({
  v: z.literal(1),
  settings: settingsSchema,
  shifts: z.array(shiftDraftSchema).min(1).max(21),
});

export type DownloadPayload = z.infer<typeof downloadSchema>;

export function downloadHref(fileName: string, settings: Settings, shifts: ShiftDraft[]): string {
  const payload: DownloadPayload = { v: 1, settings, shifts };
  return `/api/ics/${encodeURIComponent(fileName)}?d=${encodeBase64Url(JSON.stringify(payload))}`;
}

export function readDownload(encoded: string | null): DownloadPayload | null {
  if (!encoded || encoded.length > 20_000) return null;
  try {
    const parsed = downloadSchema.safeParse(JSON.parse(decodeBase64Url(encoded)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
