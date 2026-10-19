import { z } from "zod";
import { isValidTimeZone } from "./time";

/**
 * Everything the user can change without touching code. Settings live in a
 * cookie the server sets (so iOS Safari keeps them; it clears script-written
 * storage after a week without visits) and travel with each download, so a
 * calendar file always matches the preview it came from.
 */

export const reminderSchema = z.object({
  minutes: z.number().int().min(0).max(24 * 60),
  message: z.string().trim().min(1).max(120),
});

/** Which AI reads the roster image; "auto" lets the server pick one it has a key for. */
export const PROVIDER_CHOICES = ["auto", "anthropic", "openai"] as const;
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number];
export type Provider = Exclude<ProviderChoice, "auto">;

export const PROVIDER_LABELS: Record<ProviderChoice, string> = {
  auto: "Automatic",
  anthropic: "Claude",
  openai: "OpenAI",
};

/** Which service and model read a roster, as reported by the server. */
export type ReaderInfo = { provider: Provider; model: string };

export const settingsSchema = z.object({
  name: z.string().trim().min(1, "Enter the name to look for.").max(60),
  shiftTitle: z.string().trim().min(1, "Enter a title for shifts.").max(120),
  venueName: z.string().trim().min(1, "Enter the venue name.").max(80),
  venueAddress: z.string().trim().max(200),
  travelTitle: z.string().trim().min(1, "Enter a title for travel.").max(120),
  travelMinutes: z.number().int().min(5, "Travel time must be at least 5 minutes.").max(240),
  reminders: z.array(reminderSchema).max(3),
  timeZone: z.string().refine(isValidTimeZone, "Unknown time zone."),
  includeFunctionCodes: z.boolean(),
  provider: z.enum(PROVIDER_CHOICES),
});

export type Settings = z.infer<typeof settingsSchema>;
export type Reminder = z.infer<typeof reminderSchema>;

export const DEFAULT_SETTINGS: Settings = {
  name: "Meng",
  shiftTitle: "Work – Banquets (W Melbourne)",
  venueName: "W Melbourne",
  venueAddress: "",
  travelTitle: "Travel to work – W Melbourne",
  travelMinutes: 30,
  reminders: [
    { minutes: 30, message: "Start getting ready for work." },
    { minutes: 15, message: "Leave soon." },
  ],
  timeZone: "Australia/Melbourne",
  includeFunctionCodes: false,
  provider: "auto",
};

export const SETTINGS_COOKIE = "ac_settings";
export const SETTINGS_COOKIE_DAYS = 400;

/** Fills in fields added after the cookie was written; anything invalid falls back to the defaults. */
export function settingsFromUnknown(value: unknown): Settings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const merged = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(value as object) });
  return merged.success ? merged.data : DEFAULT_SETTINGS;
}
