import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, passwordMatches, sitePassword } from "@/server/auth";

export async function POST(request: NextRequest) {
  const password = sitePassword();
  if (!password) {
    return NextResponse.json({ error: "The site has no password yet: set APP_PASSWORD on the server (see the README)." }, { status: 503 });
  }
  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" && "password" in body && typeof body.password === "string" ? body.password : "";
  if (!(await passwordMatches(input, password))) {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return response;
}
