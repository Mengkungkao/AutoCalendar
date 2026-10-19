import { NextResponse, type NextRequest } from "next/server";
import { SETTINGS_COOKIE, SETTINGS_COOKIE_DAYS, settingsSchema } from "@/lib/settings";
import { isSignedIn } from "@/server/auth";
import { encodeSettingsCookie } from "@/server/settings-cookie";

export async function POST(request: NextRequest) {
  if (!(await isSignedIn(request.cookies))) {
    return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  }
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Those settings aren't valid." }, { status: 400 });
  }
  const response = NextResponse.json({ settings: parsed.data });
  response.cookies.set(SETTINGS_COOKIE, encodeSettingsCookie(parsed.data), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SETTINGS_COOKIE_DAYS * 86_400,
  });
  return response;
}
