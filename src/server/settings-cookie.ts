import { decodeBase64Url, encodeBase64Url } from "@/lib/base64url";
import { DEFAULT_SETTINGS, SETTINGS_COOKIE, settingsFromUnknown, type Settings } from "@/lib/settings";

type CookieReader = { get(name: string): { value: string } | undefined };

export function readSettingsCookie(cookies: CookieReader): Settings {
  const value = cookies.get(SETTINGS_COOKIE)?.value;
  if (!value) return DEFAULT_SETTINGS;
  try {
    return settingsFromUnknown(JSON.parse(decodeBase64Url(value)));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function encodeSettingsCookie(settings: Settings): string {
  return encodeBase64Url(JSON.stringify(settings));
}
