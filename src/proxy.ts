import { NextResponse, type NextRequest } from "next/server";
import { isSignedIn } from "@/server/auth";

// Pages need the sign-in cookie; anyone else is sent to /login. API routes
// check the cookie themselves (and answer 401), so uploads aren't buffered here.
export async function proxy(request: NextRequest) {
  if (await isSignedIn(request.cookies)) return NextResponse.next();
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/|_next/|login|favicon\\.ico|icon\\.svg|apple-icon\\.png|robots\\.txt).*)"],
};
